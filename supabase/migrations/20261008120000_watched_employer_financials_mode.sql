-- Per-employer control for the IRS Form 990 lookup. Many tracked employers are not 501(c)(3)
-- nonprofits (for-profit companies, municipalities, federal agencies), so a 990 lookup is
-- meaningless for them. 'auto' lets the app guess from the employer's name and category and skip
-- government and clearly for-profit employers; 'on' / 'off' are the user's override and always win.
-- Additive and safe to run twice; employers without a value behave as 'auto'.
alter table public.watched_employers
  add column if not exists financials_mode text not null default 'auto'
  check (financials_mode in ('auto', 'on', 'off'));
