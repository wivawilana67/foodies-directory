from django.db import IntegrityError, transaction
from django.test import TestCase

from foodies.models import Collection, CollectionPlace, Dish, Label, Person, Photo, Place, PlaceRating


class ConstraintTests(TestCase):
    def setUp(self):
        self.place = Place.objects.create(name='Warung A')
        self.person = Person.objects.create(name='A', position=1)

    def assert_rejected(self, create):
        with self.assertRaises(IntegrityError), transaction.atomic():
            create()

    def test_label_names_are_unique_ignoring_case(self):
        Label.objects.create(name='Spicy')
        self.assert_rejected(lambda: Label.objects.create(name='spicy'))

    def test_photo_needs_exactly_one_owner(self):
        dish = Dish.objects.create(place=self.place, name='Soto')
        Photo.objects.create(place=self.place)
        Photo.objects.create(dish=dish)
        self.assert_rejected(lambda: Photo.objects.create())
        self.assert_rejected(lambda: Photo.objects.create(place=self.place, dish=dish))

    def test_one_rating_per_person_and_place(self):
        PlaceRating.objects.create(place=self.place, person=self.person, score='8')
        self.assert_rejected(lambda: PlaceRating.objects.create(place=self.place, person=self.person))

    def test_place_once_per_collection(self):
        collection = Collection.objects.create(name='Saigon trip')
        CollectionPlace.objects.create(collection=collection, place=self.place)
        self.assert_rejected(lambda: CollectionPlace.objects.create(collection=collection, place=self.place))

    def test_deleting_a_place_removes_its_children(self):
        dish = Dish.objects.create(place=self.place, name='Soto')
        Photo.objects.create(dish=dish)
        PlaceRating.objects.create(place=self.place, person=self.person)
        collection = Collection.objects.create(name='Trip')
        CollectionPlace.objects.create(collection=collection, place=self.place)
        self.place.delete()
        self.assertEqual((Dish.objects.count(), Photo.objects.count(), PlaceRating.objects.count(),
                          CollectionPlace.objects.count(), Collection.objects.count()), (0, 0, 0, 0, 1))
