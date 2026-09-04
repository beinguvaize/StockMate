-- Applied to prod 20 Aug 2026.
-- Every tenant is an Indian business, so India / INR / rupee is the default
-- rather than something each signup fills in. Four of ten profiles had country,
-- currency and currencySymbol EMPTY, and seven places in the app fell back to an
-- empty string for the symbol, so those tenants saw amounts with no currency
-- mark at all.
--
-- create-tenant inserts a profile WITHOUT these columns, so the defaults below
-- cover new signups with no edge-function redeploy. Verified by running that
-- exact insert in a rolled-back transaction: the row came back India / INR / ₹ /
-- Asia/Kolkata / en-IN.
--
-- The backfill fills blanks only; a tenant that set something else keeps it.

ALTER TABLE business_profile ALTER COLUMN country          SET DEFAULT 'India';
ALTER TABLE business_profile ALTER COLUMN currency         SET DEFAULT 'INR';
ALTER TABLE business_profile ALTER COLUMN "currencySymbol" SET DEFAULT '₹';
ALTER TABLE business_profile ALTER COLUMN timezone         SET DEFAULT 'Asia/Kolkata';
ALTER TABLE business_profile ALTER COLUMN locale           SET DEFAULT 'en-IN';

UPDATE business_profile SET country          = 'India'        WHERE nullif(country,'')          IS NULL;
UPDATE business_profile SET currency         = 'INR'          WHERE nullif(currency,'')         IS NULL;
UPDATE business_profile SET "currencySymbol" = '₹'            WHERE nullif("currencySymbol",'') IS NULL;
UPDATE business_profile SET timezone         = 'Asia/Kolkata' WHERE nullif(timezone,'')         IS NULL;
UPDATE business_profile SET locale           = 'en-IN'        WHERE nullif(locale,'')           IS NULL;
