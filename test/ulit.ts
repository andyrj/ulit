import { expect } from "chai";
import "mocha";
import { 
  defaultTemplateFn,
  Directive,
  html,
  render
} from "../src/ulit";

// beforeEach(() => {
//   const body = document.body;
//   const first = body.firstChild;
//   let cursor = body.lastChild;
//   while(cursor != null) {
//     const next = cursor.previousSibling;
//     body.removeChild(cursor);
//     if (next === first) {
//       body.removeChild(next);
//       cursor = null;
//     } else {
//       cursor = next;
//     }
//   }
// });

describe("render", () => {
  it("should handle static templates", () => {
    const test1 = html`<div id="test">test</div>`;
    render(test1);
    expect(document.body.innerHTML).to.equal(`<div id="test">test</div>`);
  });
  it("should handle defaultTemplateFn", () => {
    const test2 = "test2";
    const div = document.createElement("div");
    render(test2);
    expect(document.body.innerHTML).to.equal(test2);
    render(defaultTemplateFn(div));
    expect(document.body.firstChild).to.equal(div);
  });
  /*
  it("should handle attribute parts", () => {
    const str = "test3";
    const test3 = val => html`<div id=${val}></div>`;
    render(test3(str));
    expect(document.body.innerHTML).to.equal(`<div id="${str}"></div>`);  
    render(test3(null));
    expect(document.body.innerHTML).to.equal(`<div></div>`);
  });
  */
  /*
  it("expression can change part types between renders", () => {
    const str = "test";
    const div = document.createElement("div");
    div.id = "test";
    const test3 = defaultTemplateFn;
    render(test3(str));
    expect(document.body.innerHTML).to.equal("test");
    render(test3(div));
    expect(document.body.innerHTML).to.equal(`<div id="test"></div>`);
  });
  it("should handle single node templates", () => {
    const str = "test";
    const test4 = defaultTemplateFn; // val => html`${val}`;
    render(test4(str));
    expect(document.body.innerHTML).to.equal(`test`);
  });
  
  it("should handle dynamic nodes dispersed in static nodes", () => {
    const str = "dynamic";
    const template = html`<div>This is static, this is ${str}</div>`;
    render(template);
    expect(document.body.innerHTML).to.equal(`<div>This is static, this is ${str}</div>`);
    const template1 = html`<div>${str} is at start</div>`;
    render(template1);
    expect(document.body.innerHTML).to.equal(`<div>${str} is at start</div>`);
    const template2 = html`<div>in the middle it's ${str}!</div>`;
    render(template2);
    expect(document.body.innerHTML).to.equal(`<div>in the middle it's ${str}!</div>`);
  });
  
  it("nested templates", () => {
    const nested = html`<div id="test">test</div>`;
    const template = html`<div>${nested}</div>`;
    render(template);
    expect(document.body.innerHTML).to.equal(`<div><div id="test">test</div></div>`);
    const template1 = html`<span>${template}</span>`;
    render(template1);
    expect(document.body.innerHTML).to.equal(`<span><div><div id="test">test</div></div></span>`);
  });
  
  it("setting event handler should work", () => {
    const handler = (e: any) => {};
    const template = html`<div onclick=${handler}>test</div>`;
    render(template);
    expect((document.body.firstChild as any).onclick !== undefined).to.equal(true);
  });
  
  it("nested templates should update in place", () => {
    const nested = (str: string) => html`<div class=nested>${str}</div>`;
    const template = (str: string) => html`<div>${nested(str)}</div>`;
    render(template("test"));
    expect((document.body.firstChild as any).firstChild.firstChild.nodeValue).to.equal("test");
    render(template("123"));
    expect((document.body.firstChild as any).firstChild.firstChild.nodeValue).to.equal("123");
  });
  
  it("attribute directives should work as expected", () => {
    const template = (str: string) => html`<div id=${Directive(part => part.update(str))}>test</div>`;
    render(template("test"));
    expect((document.body.firstChild as any).id).to.equal("test");
    render(template("test1"));
    expect((document.body.firstChild as any).id).to.equal("test1");
  });
  
  it("templates should be able to start and end with parts", () => {
    const t1 = "test";
    const t2 = "test1";
    const template = html`${t1} and ${t2}`;
    render(template);
    expect(document.body.innerHTML).to.equal("test and test1");
  });
  
  it("fragments", () => {
    const f1 = document.createDocumentFragment();
    f1.appendChild(document.createTextNode("test"));
    f1.appendChild(document.createTextNode("test1"));
    const template = (frag: DocumentFragment) => html`<div>${frag}</div>`;
    render(template(f1));
    expect(document.body.innerHTML).to.equal("<div>testtest1</div>");
    const f2 = document.createDocumentFragment();
    f2.appendChild(document.createTextNode("test"));
    f2.appendChild(document.createElement("br"));
    f2.appendChild(document.createTextNode("test1"));
    render(template(f2));
    expect(document.body.innerHTML).to.equal("<div>test<br>test1</div>");
  });

  it("should handle dom nodes", () => {
    const node = document.createElement("div");
    node.id = "test";
    const template = html`<div>${node}</div>`;
    render(template);
    expect(document.body.innerHTML).to.equal(`<div><div id="test"></div></div>`);
  });
  it("directives", () => {
    let lastPart;
    const template = html`<div>${Directive(part => {lastPart = part})}</div>`;
    render(template);
    lastPart.update("test");
    expect(document.body.firstChild.firstChild.nodeValue).to.equal("test");
    lastPart.update("test123");
    expect(document.body.firstChild.firstChild.nodeValue).to.equal("test123");
  });
  it("arrays", () => {
    const arr = [1, 2 ,3];
    const template = html`<div>${arr}</div>`;
    render(template);
    expect(document.body.innerHTML).to.equal("<div>123</div>");
    arr[0] = 3;
    arr[1] = 2;
    arr[2] = 1;
    render(template);
    expect(document.body.innerHTML).to.equal("<div>321</div>");
  });
  */
});

