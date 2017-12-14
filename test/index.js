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

test("static templates", t => {
  const template = html`<div id="test">test</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.id, "test");
  t.is(template.fragment.content.firstChild.firstChild.nodeValue, "test");
});

test("dynamic template with string child", t => {
  const str = "test";
  const template = html`<div id="test">${str}</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.id, "test");
  t.is(template.fragment.content.firstChild.firstChild.nodeValue, str);
});

test("dom nodes", t => {
  const node = document.createElement("div");
  node.id = "test";
  const template = html`<div>${node}</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.firstChild.id, "test");
});

test("dynamic nodes dispersed in static nodes", t => {
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

test("dynamic attributes", t => {
  const str = "test";
  const template = html`<div id=${str}>test</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.id, str);
});

test("dynamic child interspersed with static nodes", t => {
  const node = document.createElement("div");
  node.innerHTML = "test";
  const template = html`<div><br>before${node}<br>after</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.outerHTML, "<div><br>before<div>test</div><br>after</div>");
});

test("nested templates", t => {
  const nested = html`<div id="test">test</div>`;
  const template = html`<div>${nested}</div>`;
  render(template);
  t.is(document.body.firstChild.firstChild.id, "test");
  t.is(document.body.firstChild.firstChild.firstChild.nodeValue, "test");

  const template1 = html`<div>${html`<div id="test">test</div>`}</div>`;
  template1.update();
  t.is(template1.fragment.content.firstChild.firstChild.id, "test");
  t.is(template1.fragment.content.firstChild.firstChild.firstChild.nodeValue, "test");
});

test("expression can change part types between renders", t => {
  const str = "test";
  const div = document.createElement("div");
  div.id = "test";
  const template = html`<div>${str}</div>`;
  template.update();
  t.is(template.fragment.content.firstChild.firstChild.nodeValue, "test");
  template.update([div]);
  t.is(template.fragment.content.firstChild.firstChild.id, "test");
});

test("directives", t => {
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
  const handler = e => {};
  const template = html`<div onclick=${handler}>test</div>`;
  render(template);
  t.is(document.body.firstChild.onclick !== undefined, true);
});

test("nested templates should update in place", t => {
  const nested = str => html`<div class=nested>${str}</div>`;
  const template = str => html`<div>${nested(str)}</div>`;
  render(template("test"));
  t.is(document.body.firstChild.firstChild.firstChild.nodeValue, "test");
  render(template("123"));
  t.is(document.body.firstChild.firstChild.firstChild.nodeValue, "123");
});

test("attribute directives should work as expected", t => {
  const template = str => html`<div id=${part => part.update(str)}>test</div>`;
  render(template("test"));
  t.is(document.body.firstChild.id === "test", true);
  render(template("test1"));
  t.is(document.body.firstChild.id === "test1", true);
});

test("templates should be able to start and end with parts", t => {
  const test = "test";
  const test1 = "test1";
  const template = html`${test} and ${test1}`;
  render(template);
  t.is(document.body.innerHTML === "test and test1", true);
});
