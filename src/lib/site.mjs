// Site-wide settings. Renaming the site or adding a contact address happens here.
export const SITE = {
  name: 'The Oche',
  tagline: 'PDC darts: live scores, results, news and rankings',
  url: 'https://the-oche-mocha.vercel.app',
  // Shown on /about when set. Leave empty: the contact form (below) keeps the address private.
  contactEmail: '',
  // Contact form: messages go through Web3Forms (web3forms.com), which emails them to the
  // address the access key was created with. The key is safe to publish (it can only send
  // to that inbox and never reveals it). Set PUBLIC_WEB3FORMS_KEY in Vercel's environment
  // variables (and in .env for local builds).
  contactKey: import.meta.env?.PUBLIC_WEB3FORMS_KEY || '',
};
