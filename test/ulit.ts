import test from "ava-ts";
import { JSDOM } from "jsdom";
import { html, render } from "../src/ulit";

test.beforeEach(t => {
  const dom = new JSDOM("<!DOCTYPE html><head></head><body></body></html>");
  const a = global as any;
  a.window = dom.window;
  a.document = dom.window.document;
});

test("static templates", t => {
  const template = html`<div id="test">test</div>`;
  render(template);
  t.is(!document.body.firstChild, false);
  t.is((document.body.firstChild as any).id, "test");
  t.is((document.body.firstChild as any).firstChild.nodeValue, "test");
});

test("dynamic template with string child", t => {
  const str = "test";
  const template = html`<div id="test">${str}</div>`;
  render(template);
  t.is((document.body.firstChild as any).id, "test");
  t.is((document.body.firstChild as any).firstChild.nodeValue, str);
});

test("dom nodes", t => {
  const node = document.createElement("div");
  node.id = "test";
  const template = html`<div>${node}</div>`;
  render(template);
  t.is((document.body.firstChild as any).firstChild.id, "test");
});

test("dynamic nodes dispersed in static nodes", t => {
  const str = "dynamic";
  const template = html`<div>This is static, this is ${str}</div>`;
  render(template);
  t.is((document.body.firstChild as any).innerHTML, "This is static, this is dynamic");

  const template1 = html`<div>${str} is at start</div>`;
  render(template1);
  t.is((document.body.firstChild as any).innerHTML, "dynamic is at start");

  const template2 = html`<div>in the middle it's ${str}!</div>`;
  render(template2);
  t.is((document.body.firstChild as any).innerHTML, "in the middle it's dynamic!");
});

test("dynamic attributes", t => {
  const str = "test";
  const template = html`<div id=${str}>test</div>`;
  render(template);
  t.is(document.body.innerHTML, `<div id="test">test</div>`);
});

test("dynamic child interspersed with static nodes", t => {
  const node = document.createElement("div");
  node.innerHTML = "test";
  const template = html`<div><br>before${node}<br>after</div>`;
  render(template);
  t.is(document.body.innerHTML, "<div><br>before<div>test</div><br>after</div>");
});

test("nested templates", t => {
  const nested = html`<div id="test">test</div>`;
  const template = html`<div>${nested}</div>`;
  render(template);
  t.is((document.body.firstChild as any).firstChild.id, "test");
  t.is((document.body.firstChild as any).firstChild.firstChild.nodeValue, "test");

  const template1 = html`<div>${html`<div id="test">test</div>`}</div>`;
  render(template1);
  t.is((document.body.firstChild as any).firstChild.id, "test");
  t.is((document.body.firstChild as any).firstChild.firstChild.nodeValue, "test");
});

test("null should remove attribute", t => {
  const template = (enable: any) => html`<div enabled=${enable}>test</div>`;
  render(template(true));
  t.is((document.body.firstChild as any).enabled, true);
  render(template(null));
  t.is((document.body.firstChild as any).enabled, "");
  t.is((document.body.firstChild as any).attributes["enabled"], undefined);
});

test("setting event handler should work", t => {
  const handler = (e: any) => {};
  const template = html`<div onclick=${handler}>test</div>`;
  render(template);
  t.is((document.body.firstChild as any).onclick !== undefined, true);
});

test("nested templates should update in place", t => {
  const nested = (str: string) => html`<div class=nested>${str}</div>`;
  const template = (str: string) => html`<div>${nested(str)}</div>`;
  render(template("test"));
  t.is((document.body.firstChild as any).firstChild.firstChild.nodeValue, "test");
  render(template("123"));
  t.is((document.body.firstChild as any).firstChild.firstChild.nodeValue, "123");
});

test("attribute directives should work as expected", t => {
  const template = (str: string) => html`<div id=${part => part.update(str)}>test</div>`;
  render(template("test"));
  t.is((document.body.firstChild as any).id === "test", true);
  render(template("test1"));
  t.is((document.body.firstChild as any).id === "test1", true);
});

test("templates should be able to start and end with parts", t => {
  const t1 = "test";
  const t2 = "test1";
  const template = html`${t1} and ${t2}`;
  render(template);
  t.is(document.body.innerHTML === "test and test1", true);
});

test("fragments", t => {
  const f1 = document.createDocumentFragment();
  f1.appendChild(document.createTextNode("test"));
  f1.appendChild(document.createTextNode("test1"));
  const template = (frag: DocumentFragment) => html`<div>${frag}</div>`;
  debugger;
  render(template(f1));
  t.is(document.body.innerHTML === "<div>testtest1</div>", true);
  const f2 = document.createDocumentFragment();
  f2.appendChild(document.createTextNode("test"));
  f2.appendChild(document.createElement("br"));
  f2.appendChild(document.createTextNode("test1"));
  render(template(f2));
  t.is(document.body.innerHTML, "<div>test<br>test1</div>");
});

// test("expression can change part types between renders", t => {
//   const str = "test";
//   const div = document.createElement("div");
//   div.id = "test";
//   const template = html`<div>${str}</div>`;
//   template.update();
//   t.is(template.fragment.content.firstChild.firstChild.nodeValue, "test");
//   template.update([div]);
//   t.is(template.fragment.content.firstChild.firstChild.id, "test");
// });

// test("directives", t => {
//   let lastUpdate;
//   const template = html`<div>${part => {lastUpdate = part.update}}</div>`;
//   render(template);
//   lastUpdate("test");
//   t.is(document.body.firstChild.firstChild.nodeValue, "test");
//   lastUpdate("test123");
//   t.is(document.body.firstChild.firstChild.nodeValue, "test123");
// });

// test("arrays", t => {
//   console.log("+++++");
//   const arr = [1, 2 ,3];
//   const template = html`<div>${arr}</div>`;
//   render(template);
//   t.is(document.body.innerHTML, "<div>123</div>");
//   arr[0] = 3;
//   arr[1] = 2;
//   arr[2] = 1;
//   render(template);
//   t.is(document.body.innerHTML, "<div>321</div>");
//   console.log("-----");
// });
