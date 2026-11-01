/*
 * Showsum HQ: the two settings for this copy of the app. Both are safe to publish.
 *
 * clientId   Your Google sign-in client ID (Google Cloud → Google Auth Platform → Clients). Ends .apps.googleusercontent.com.
 * scriptPin  A fingerprint of your HQ script's address. It locks HQ to that script, so a link to anyone else's script is
 *            refused. It is not the address itself, which stays off GitHub. HQ shows it the first time you connect,
 *            or work it out on a Mac:
 *            printf %s 'https://script.google.com/macros/s/…/exec' | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | cut -c1-22
 */
window.HQ_SETUP = {
  clientId: '',
  scriptPin: ''
};
