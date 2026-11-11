// Apply the saved color scheme (and language tag) before first paint to avoid a flash.
// Loaded as a blocking classic script from index.html (kept tiny on purpose).
;(function () {
  try {
    var mode = localStorage.getItem('badminton:color-scheme') || 'auto'
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (mode === 'dark' || (mode === 'auto' && prefersDark)) {
      document.documentElement.classList.add('dark')
    }
    // Saved language (set by the app's language switch), for screen readers before Vue loads.
    if (localStorage.getItem('badminton:locale') === 'en') document.documentElement.lang = 'en'
  } catch {
    // Storage unavailable (private mode): fall back to the default theme.
  }
})()
