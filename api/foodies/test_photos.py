from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import override_settings

from foodies.auth import ApiError
from foodies.models import AuditLog, Dish, Photo, Place
from foodies.test_api import ApiTestCase


@override_settings(PHOTO_BUCKET='foodies-photos-test')
class PhotoTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.place = Place.objects.create(name='Warung A')
        signer = mock.patch('foodies.storage.signed_put_url', side_effect=lambda key: f'https://signed/{key}')
        self.check = mock.patch('foodies.storage.check_uploaded').start()
        self.delete = mock.patch('foodies.storage.delete_objects').start()
        signer.start()
        self.addCleanup(mock.patch.stopall)

    def add_photo(self, **owner):
        owner = owner or {'place': str(self.place.id)}
        upload = self.call('post', '/api/photos/upload-url', owner).json()
        return upload, self.call('post', '/api/photos', {'photoId': upload['photoId'], **owner})

    def test_upload_then_register_adds_photo_with_public_url(self):
        upload, response = self.add_photo()
        photo_id = upload['photoId']
        self.assertEqual(upload['upload']['url'], f'https://signed/photos/{photo_id}.jpg')
        self.assertEqual(upload['thumbUpload']['url'], f'https://signed/photos/{photo_id}-thumb.jpg')
        self.assertEqual(upload['upload']['headers']['Content-Type'], 'image/jpeg')
        self.assertEqual([c.args[0] for c in self.check.call_args_list],
                         [f'photos/{photo_id}.jpg', f'photos/{photo_id}-thumb.jpg'])
        photo = response.json()['photo']
        self.assertEqual(photo['url'], f'https://storage.googleapis.com/foodies-photos-test/photos/{photo_id}.jpg')
        self.assertEqual((photo['position'], photo['thumbUrl'][-10:]), (0, '-thumb.jpg'))
        self.assertEqual(AuditLog.objects.get(entity='photo').action, 'add')

    def test_at_most_five_and_positions_follow(self):
        for _ in range(5):
            self.add_photo()
        self.assertEqual(list(Photo.objects.order_by('position').values_list('position', flat=True)), [0, 1, 2, 3, 4])
        refused = self.call('post', '/api/photos/upload-url', {'place': str(self.place.id)})
        self.assertIn('Up to 5 photos', refused.json()['error'])

    def test_bad_upload_is_not_registered(self):
        upload = self.call('post', '/api/photos/upload-url', {'place': str(self.place.id)}).json()
        self.check.side_effect = ApiError('Only JPEG photos are accepted')
        response = self.call('post', '/api/photos', {'photoId': upload['photoId'], 'place': str(self.place.id)})
        self.assertEqual(response.json()['error'], 'Only JPEG photos are accepted')
        self.assertEqual(Photo.objects.count(), 0)

    def test_owner_must_be_exactly_one_known_place_or_dish(self):
        dish = Dish.objects.create(place=self.place, name='Soto')
        both = self.call('post', '/api/photos/upload-url', {'place': str(self.place.id), 'dish': str(dish.id)})
        self.assertEqual(both.status_code, 400)
        unknown = self.call('post', '/api/photos/upload-url', {'dish': '00000000-0000-0000-0000-000000000000'})
        self.assertEqual(unknown.status_code, 404)
        _, response = self.add_photo(dish=str(dish.id))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(dish.photos.count(), 1)

    def test_same_photo_cannot_be_added_twice(self):
        upload, _ = self.add_photo()
        again = self.call('post', '/api/photos', {'photoId': upload['photoId'], 'place': str(self.place.id)})
        self.assertIn('already added', again.json()['error'])

    def test_delete_removes_row_then_bucket_objects(self):
        upload, _ = self.add_photo()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.call('delete', f'/api/photos/{upload["photoId"]}')
        self.assertEqual(response.json()['photos'], [])
        self.delete.assert_called_once()
        self.assertEqual(sorted(self.delete.call_args.args[0])[0], f'photos/{upload["photoId"]}-thumb.jpg')

    def test_deleting_a_dish_deletes_its_photo_files(self):
        dish = Dish.objects.create(place=self.place, name='Soto')
        upload, _ = self.add_photo(dish=str(dish.id))
        with self.captureOnCommitCallbacks(execute=True):
            self.call('delete', f'/api/dishes/{dish.id}')
        self.assertIn(f'photos/{upload["photoId"]}.jpg', self.delete.call_args.args[0])

    @override_settings(PHOTO_BUCKET='')
    def test_not_configured(self):
        mock.patch.stopall()
        response = self.call('post', '/api/photos/upload-url', {'place': str(self.place.id)})
        self.assertEqual(response.status_code, 503)

    def test_drive_photo_shows_drive_url_until_copied(self):
        Photo.objects.create(place=self.place, drive_id='driveABC')
        photo = self.call('get', '/api/bootstrap').json()['places'][0]['photos'][0]
        self.assertEqual(photo['thumbUrl'], 'https://drive.google.com/thumbnail?id=driveABC&sz=w320')


def image_response(url, content_type='image/jpeg', status=200):
    return mock.Mock(url=url, history=[], status_code=status, headers={'Content-Type': content_type},
                     content=b'\xff\xd8\xff-image')


@override_settings(PHOTO_BUCKET='foodies-photos-test')
class CopyDrivePhotosTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        place = Place.objects.create(name='Warung A')
        self.todo = Photo.objects.create(place=place, drive_id='drive1')
        self.done = Photo.objects.create(place=place, drive_id='drive2', key='photos/x.jpg', position=1)

    @mock.patch('foodies.storage.bucket')
    @mock.patch('foodies.storage.upload_bytes')
    @mock.patch('foodies.management.commands.copy_drive_photos.requests.get')
    def test_copies_only_uncopied_photos(self, get, upload, _bucket):
        get.side_effect = lambda url, timeout: image_response('https://lh3.googleusercontent.com/abc')
        out = StringIO()
        call_command('copy_drive_photos', stdout=out)
        self.todo.refresh_from_db()
        self.assertEqual(self.todo.key, f'photos/{self.todo.id}.jpg')
        self.assertEqual(self.todo.thumb_key, f'photos/{self.todo.id}-thumb.jpg')
        self.assertEqual([c.args[0] for c in upload.call_args_list], [self.todo.key, self.todo.thumb_key])
        self.assertIn('sz=w320', get.call_args_list[1].args[0])
        self.assertIn('Copied 1 photos, 0 failed', out.getvalue())

    @mock.patch('foodies.storage.bucket')
    @mock.patch('foodies.storage.upload_bytes')
    @mock.patch('foodies.management.commands.copy_drive_photos.requests.get')
    def test_refuses_non_images_and_redirects_off_google(self, get, upload, _bucket):
        for response in (image_response('https://drive.google.com/x', content_type='text/html'),
                         image_response('https://evil.example/x')):
            get.side_effect = lambda url, timeout, r=response: r
            err = StringIO()
            call_command('copy_drive_photos', stdout=StringIO(), stderr=err)
            self.assertIn('not copied', err.getvalue())
        upload.assert_not_called()
        self.todo.refresh_from_db()
        self.assertEqual(self.todo.key, '')

    def test_dry_run_counts(self):
        out = StringIO()
        call_command('copy_drive_photos', '--dry-run', stdout=out)
        self.assertIn('Dry run: 1 photos to copy', out.getvalue())


@override_settings(PHOTO_BUCKET='foodies-photos-test', MAX_PHOTO_BYTES=100)
class CheckUploadedTests(ApiTestCase):
    def blob(self, size=50, start=b'\xff\xd8\xff'):
        blob = mock.Mock(size=size)
        blob.download_as_bytes.return_value = start
        return blob

    def check(self, blob):
        from foodies import storage
        with mock.patch('foodies.storage.bucket') as bucket:
            bucket.return_value.get_blob.return_value = blob
            storage.check_uploaded('photos/x.jpg')

    def test_good_jpeg_passes(self):
        blob = self.blob()
        self.check(blob)
        blob.delete.assert_not_called()

    def test_missing_too_large_or_not_jpeg_is_refused_and_deleted(self):
        with self.assertRaisesMessage(ApiError, 'Upload not found'):
            self.check(None)
        for blob, message in ((self.blob(size=101), 'too large'), (self.blob(start=b'\x89PN'), 'Only JPEG')):
            with self.assertRaisesMessage(ApiError, message):
                self.check(blob)
            blob.delete.assert_called_once()
