/**
 * Google Apps Script — Form response Sheet → POST /api/form-submit
 *
 * INSTALLATION
 * ------------
 * 1. Open the Google Form's linked response Spreadsheet
 *    (Form → Responses → green Sheets icon, or open the linked Sheet directly).
 * 2. In the Spreadsheet: Extensions → Apps Script
 * 3. Delete any default code and paste this entire file.
 * 4. Project Settings (gear) → Script Properties → Add:
 *      APP_HOST                 = https://YOUR_DEPLOYED_APP_HOST   (no trailing slash)
 *      GOOGLE_FORM_WEBHOOK_SECRET = <same value as server env GOOGLE_FORM_WEBHOOK_SECRET>
 * 5. Select function setupTrigger → Run
 * 6. Authorize the script when prompted (review permissions for Spreadsheet + UrlFetch).
 * 7. Submit a test Form response and confirm the app receives POST /api/form-submit.
 *
 * Notes:
 * - Use an installable onFormSubmit trigger (created by setupTrigger), not a simple trigger.
 * - e.namedValues comes from the Sheet form-submit event (question title → string[]).
 */

function onFormSubmit(e) {
  var props = PropertiesService.getScriptProperties();
  var appHost = props.getProperty("APP_HOST");
  var secret = props.getProperty("GOOGLE_FORM_WEBHOOK_SECRET");

  if (!appHost || !secret) {
    throw new Error(
      "Missing Script Properties: set APP_HOST and GOOGLE_FORM_WEBHOOK_SECRET",
    );
  }

  if (!e || !e.namedValues) {
    throw new Error("onFormSubmit missing e.namedValues — use Spreadsheet form-submit trigger");
  }

  var payload = {
    source: "google_form",
    submittedAt: new Date().toISOString(),
    fields: e.namedValues,
  };

  var url = appHost.replace(/\/$/, "") + "/api/form-submit";

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-Webhook-Secret": secret,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  Logger.log("form-submit status=" + code + " body=" + body);

  if (code < 200 || code >= 300) {
    throw new Error("form-submit failed status=" + code + " body=" + body);
  }
}

/**
 * Creates an installable Spreadsheet onFormSubmit trigger if one does not already exist.
 * Run once from the Apps Script editor after setting Script Properties.
 */
function setupTrigger() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) {
    throw new Error("Open this script from the Form response Spreadsheet");
  }

  var handlers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < handlers.length; i++) {
    var t = handlers[i];
    if (
      t.getHandlerFunction() === "onFormSubmit" &&
      t.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT
    ) {
      Logger.log("onFormSubmit trigger already exists — id=" + t.getUniqueId());
      return;
    }
  }

  ScriptApp.newTrigger("onFormSubmit")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log("Created installable onFormSubmit trigger for spreadsheet " + ss.getId());
}
