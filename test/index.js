import test from "ava";
import { JSDOM } from "jsdom";
import atob from "atob";
import btoa from "btoa";
import { html, render } from "../src";

test.beforeEach(t => {
  const dom = new JSDOM("<!DOCTYPE html><head></head><body></body></html>");
  global.window = dom.window;
  global.document = dom.window.document;
  global.atob = atob;
  global.btoa = btoa;
  global.window.atob = atob;
  global.window.btoa = btoa;
});

test("tagged template literal should handle static templates", t => {
  const template = html`<div id="test">test</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.id, "test");
  t.is(template.fragment.content.firstChild.firstChild.nodeValue, "test");
});

test("tagged template literal should handle dynamic template with string child", t => {
  const str = "test";
  const template = html`<div id="test">${str}</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.id, "test");
  t.is(template.fragment.content.firstChild.firstChild.nodeValue, str);
});

test("tagged template literal should handle dom nodes", t => {
  const node = document.createElement("div");
  node.id = "test";
  const template = html`<div>${node}</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.firstChild.id, "test");
});

test("tagged template literal should handle dynamic nodes dispersed in static nodes", t => {
  const str = "dynamic";
  const template = html`<div>This is static, this is ${str}</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.innerHTML, "This is static, this is dynamic");

  const template1 = html`<div>${str} is at start`;
  template1.update();
  t.is(template1.fragment.content.firstChild.innerHTML, "dynamic is at start");

  const template2 = html`<div>in the middle it's ${str}!`;
  template2.update();
  t.is(template2.fragment.content.firstChild.innerHTML, "in the middle it's dynamic!");
})

test("tagged template literal should handle dynamic attributes", t => {
  const str = "test";
  const template = html`<div id=${str}>test</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.id, str);
});

test("tagged template literal should handle dynamic child interspersed with static nodes", t => {
  const node = document.createElement("div");
  node.innerHTML = "test";
  const template = html`<div><br>before${node}<br>after</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.outerHTML, "<div><br>before<div>test</div><br>after</div>");
});

test("tagged template literal should handle nested template", t => {
  const nested = html`<div id="test">test</div>`;
  const template = html`<div>${nested}</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.firstChild.id, "test");
  t.is(template.fragment.content.firstChild.firstChild.firstChild.nodeValue, "test");

  const template1 = html`<div>${html`<div id="test">test</div>`}</div>`;
  template1.update();
  t.is(template1.fragment.content.firstChild.firstChild.id, "test");
  t.is(template1.fragment.content.firstChild.firstChild.firstChild.nodeValue, "test");
});

test("tagged template literal should allow an expression which changes types between renders", t => {
  const str = "test";
  const div = document.createElement("div");
  div.id = "test";
  const template = html`<div>${str}</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.firstChild.nodeValue, "test");
  template.update([div]);
  t.is(template.fragment.content.firstChild.firstChild.id, "test");
});

test("tagged template literal directives should work", t => {
  let lastUpdate;
  const template = html`<div>${part => {lastUpdate = part.update}}</div>`;
  template.update();
  lastUpdate("test");
  t.is(template.fragment.content.firstChild.firstChild.nodeValue, "test");
  lastUpdate("test123");
  t.is(template.fragment.content.firstChild.firstChild.nodeValue, "test123");
});

test("null should remove attribute", t => {
  const template = enable => html`<div enabled=${enable}>test</div>`;
  render(template(true));
  t.is(document.body.firstChild.enabled, true);
  render(template(null));
  t.is(document.body.firstChild.enabled, "");
  t.is(document.body.firstChild.attributes["enabled"], undefined);
});

test("setting event handler should work", t => {
  const template = html`<div onclick=${e => {}}>test</div>`;
  render(template);
  t.is(document.body.firstChild.onclick !== undefined, true);
});

test("invalid part paths should throw on init", t => {
  const template = html`<div>${"test"}</div>`;
  template.parts[0].path = [9, 9];
  t.throws(() => {
    template.update();
  });
});

/*
test("nested templates should update in place", t => {
  //console.log(document.body.innerHTML);
  const nested = str => html`<div>${str}</div>`;
  const template = str => html`<div>${nested(str)}</div>`;
  render(template("test"));
  //console.log(document.body.childNodes[0]);
  t.is(document.body.firstChild.firstChild.firstChild.nodeValue, "test");
  render(template("123"));
  t.is(document.body.firstChild.firstChild.firstChild.nodeValue, "123");
});
*/
/*
test("setting function to non-event handler attribute should work", t => {
  let count = 0;
  const test = () => count++;
  const template = html`<div test=${test}>test</div>`;
  render(template);
  t.is(document.body.firstChild.test !== undefined, true);
});
*/