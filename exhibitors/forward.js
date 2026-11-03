/* Showsum HQ · the old Exhibitors address (release 8). Exhibitors is a section of HQ now, so this page only forwards:
 * a page shared to HQ (?title=&text=&url=) opens Add exhibition there, and a notification's #show=<id> opens that exhibition. */
(function () {
  'use strict';
  var to = '../#/exhibitors';
  var m = /^#show=([A-Za-z0-9]{6,20})$/.exec(location.hash || '');
  if (m) to = '../#/exhibitors/x/' + m[1];
  else {
    var q = new URLSearchParams(location.search), keep = new URLSearchParams();
    ['title', 'text', 'url'].forEach(function (k) { var v = q.get(k); if (v) keep.set(k, v.slice(0, 2000)); });
    if (String(keep)) to = '../#/exhibitors/add?' + String(keep);
  }
  location.replace(to);
})();
