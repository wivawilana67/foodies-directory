// Spend counter: every Places API request reserves one unit first and is refused past the daily or
// monthly limit. It protects only calls made by this script, not direct use of a leaked key.

function reserveQuota_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const month = day.slice(0, 7);
    const usage = JSON.parse(props.getProperty(PROP.usage) || '{}');
    if (usage.day !== day) Object.assign(usage, { day: day, dayCount: 0 });
    if (usage.month !== month) Object.assign(usage, { month: month, monthCount: 0 });
    const dailyLimit = Number(props.getProperty(PROP.dailyLimit)) || DEFAULT_DAILY_LIMIT;
    const monthlyLimit = Number(props.getProperty(PROP.monthlyLimit)) || DEFAULT_MONTHLY_LIMIT;
    if (usage.dayCount >= dailyLimit) throw new Error('Daily lookup limit reached (' + dailyLimit + ')');
    if (usage.monthCount >= monthlyLimit) throw new Error('Monthly lookup limit reached (' + monthlyLimit + ')');
    usage.dayCount++;
    usage.monthCount++;
    props.setProperty(PROP.usage, JSON.stringify(usage));
  } finally {
    lock.releaseLock();
  }
}

// Editor-only: log today's and this month's counts.
function showUsage() {
  Logger.log(PropertiesService.getScriptProperties().getProperty(PROP.usage) || 'No lookups yet');
}
