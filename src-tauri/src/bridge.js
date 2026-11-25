/*
 * Host bridge. The app injects this at the top of <head> of every wallpaper's index.html that it
 * serves over lw:// (see `lw` protocol handler in main.rs). It gives any wallpaper, built-in or
 * imported, Lively-style customization with no extra code:
 *
 *   window.__lwProps   the values the user saved in the Customize panel, available before the page's
 *                      own scripts run (wallpapers may read them to start with the right settings)
 *   on load            livelyPropertyListener(name, value) is called once per saved value
 *   postMessage        the library's Customize preview (an iframe) sends
 *                      { type: "lw:property", name, value } and it is forwarded the same way
 *
 * The desktop wallpaper gets live changes from Rust through `eval` (main.rs push_property).
 * `__LW_PROPS__` is replaced with a JSON object by main.rs.
 */
(function () {
  "use strict";
  var props = (window.__lwProps = __LW_PROPS__);

  function apply(name, value) {
    if (typeof window.livelyPropertyListener !== "function") return;
    try {
      window.livelyPropertyListener(name, value);
    } catch (e) {
      console.error("livelyPropertyListener(" + name + ")", e);
    }
  }

  window.addEventListener("load", function () {
    for (var name in props) apply(name, props[name]);
  });

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (e.source !== window.parent || !d || d.type !== "lw:property") return;
    props[d.name] = d.value;
    apply(d.name, d.value);
  });
})();
