import { expect } from "chai";
import "mocha";
import { fail, getId, walkDOM, WalkFn } from "../src/common";

describe("common", () => {
  it("should throw anytime fail is called", () => {
    const fn = () => fail("test");
    expect(fail).to.throw();
    expect(fn).to.throw();
  });

  it("should always generate the same id for the same string", () => {
    const str1 = "test1";
    const str2 = "test2";
    const result1 = getId(str1);
    const result2 = getId(str2);
    expect(getId(str1)).to.equal(result1);
    expect(getId(str2)).to.equal(result2);
  });

  it("walkDOM should traverse all nodes in tree", () => {
    const fragment = document.createDocumentFragment();
    const d1 = document.createElement("div");
    d1.appendChild(document.createElement("div"));
    fragment.appendChild(d1);
    fragment.appendChild(document.createElement("div"));
    fragment.appendChild(document.createElement("div"));
    let count = 0;
    const walkIt: WalkFn = () => {
      count++;
      return true;
    };
    walkDOM(fragment, undefined, walkIt);
    expect(count).to.equal(4);
  });

  it("walkDOM should throw if WalkFn fn returns falsey", () => {
    const fragment = document.createDocumentFragment();
    const div = document.createElement("div");
    const errWalkFn: WalkFn = (parent, element, path) => undefined;
    expect(() => walkDOM(fragment, undefined, errWalkFn)).to.throw();
  });
});