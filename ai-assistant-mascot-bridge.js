/* ======================================================================
 * ai-assistant.js  <->  NIKORA Rabbit (mascot.js)   -   paste these lines into ai-assistant.js
 *
 * ai-assistant.js was not part of the upload, so this is the exact contract rather than an edited copy.
 * Every call is guarded, so ai-assistant.js keeps working when mascot.js is not loaded.
 * The profile lives only in this browser (localStorage 'nikora_profile'); nothing is sent to a server by mascot.js.
 * ====================================================================== */

/* 1) Remember what the CUSTOMER says about their skin.
      Put this where the customer's message is read, before it is added to the chat / sent to the agent.
      userText = the string the customer typed (never the assistant's own reply). */
if (window.NKMascot && typeof NKMascot.learn === 'function') NKMascot.learn(userText);

/* 2) Optional: save a structured profile when your agent returns one (e.g. { skinType: 'Dry', concerns: ['Barrier Repair'] }). */
if (window.NKMascot && agentProfile) NKMascot.setProfile({ skinTypes: [].concat(agentProfile.skinType || []), concerns: [].concat(agentProfile.concerns || []) });

/* 3) Optional: personalise the Concierge with the same memory (add it to the context you already send with each request).
      profile is null, or { skinTypes: ['dry', 'sensitive'], concerns: ['Barrier Repair'] } */
var profile = window.NKMascot && NKMascot.getProfile && NKMascot.getProfile();
/* e.g. context.customerProfile = profile;   or a greeting: "Welcome back! Still working on barrier repair for dry skin?" */

/* 4) Optional: keep the rabbit in sync when the chat opens (nav.js already fires 'nikora:assistant-open' for the mascot and the nav buttons). */
window.addEventListener('nikora:profile', function (e) { /* e.detail = the profile or null (after "Clear my skin profile") */ });
