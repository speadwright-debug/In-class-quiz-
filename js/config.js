/* ============================================================
   CONFIG — the only file you edit after deploying the backend.
   ============================================================

   1. APPS_SCRIPT_URL
      After deploying Code.gs as a Web App (see README step 2),
      Google gives you a URL ending in /exec. Paste it below.

   2. SHARED_SECRET
      Must EXACTLY match SHARED_SECRET at the top of Code.gs.
      Note: this value is visible to anyone who views the site's
      source. It stops casual/accidental posts to the endpoint,
      nothing more. Do not treat it as security.

   The DASHBOARD KEY is deliberately NOT in this file. It lives
   only in Code.gs and is checked on Google's servers, so it
   never appears anywhere a student's browser can read it.
*/

const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxN3oGO2-mcNPdHW00LREsEc6tgzKlywoJ2bV8ttMmaoKpnHqrmmu-CdA7W3kLXR30w/exec",
  SHARED_SECRET: "kereru-flax-42",
};
