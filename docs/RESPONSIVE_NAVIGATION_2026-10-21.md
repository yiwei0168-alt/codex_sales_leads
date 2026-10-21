# Responsive navigation visibility and dialog recovery

## Existing rule and observed issue

MA15-02 specifies a 248px collapsible desktop sidebar and a mobile drawer below 960px. The previous memory screenshot showed navigation labels over content after shrinking the desktop viewport. Actual project styles on a generated navigation DOM reproduce a precise cause: the parent is already visibility:hidden, but nav-item transition:all animates inherited visibility, retaining visible children for about the transition interval. Labels are hidden once it settles. This is a transient leak, not evidence that mobileNavOpen persisted as true.

Navigation buttons now transition only background-color, color and border-color; the sidebar's own transform animation remains. Same-DOM actual-style sampling verifies hidden labels immediately, on subsequent frames and after settlement. A second boundary exists in component state: an open mobile menu can retain dialog focus/scroll lock on expansion to desktop. A media-query change listener now closes that mobile menu and its footer popup on crossing into the desktop layout, while leaving the desktop collapsed preference unchanged.

## Verification status

Style-browser regression, full typecheck and four-file lint passed. The new actual fixed-Web fixture remains pending. It must verify immediate closed-label hiding, initial mobile, open/Escape/backdrop/navigation/close controls, mobile focus containment, 959/960 boundary recovery, footer/dialog/body-scroll cleanup, readable content focus and preserved desktop collapse state. It permits only browser read requests and blocks external origins; all accounts/containers are disposable.

No business API, stored permission, model, real task quality or deployment claim is added. Older memory interaction evidence remains version-scoped. G14-G20/deployment remain deferred.

[Evidence](evidence/ma24-g13-responsive-navigation-2026-10-21.json).
