// Print trigger for exported HTML reports. Kept as a static external script
// so report pages work under the strict script-src 'self' CSP.
document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("[data-print]")) {
    window.print();
  }
});
