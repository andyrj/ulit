import test from "ava";
import { html, render } from "../src";

// this test was poisoning test suite by mutating templateCache

test.beforeEach(t => {
  const dom = new JSDOM("<!DOCTYPE html><head></head><body></body></html>");
  global.window = dom.window;
  global.document = dom.window.document;
  global.atob = atob;
  global.btoa = btoa;
  global.window.atob = atob;
  global.window.btoa = btoa;
});

test("invalid part paths should throw on init", t => {
  const template = html`<div>${"test"}</div>`;
  template.parts[0].path = [9, 9];
  t.throws(() => {
    template.update();
  });
});