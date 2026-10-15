import './test-env';
// Synthetic injected ports only; no workspace credentials/database inherited.
Object.assign(process.env,{APP_ENV:'development',ENV_VALIDATION_MODE:'enforce',PAYMENT_MODE:'uat',
  WINDCAVE_ENDPOINT:'https://uat.windcave.com/api/v1',WINDCAVE_USERNAME:'synthetic-account',WINDCAVE_API_KEY:'synthetic-key',
  FEATURE_PROVIDER_RECONCILIATION:'true',FEATURE_NEW_RETAIL_PAYMENTS:'true',FEATURE_INVOICE_PAYMENTS:'true'});
