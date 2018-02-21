import { expect } from "chai";
import "mocha";
import { DomTarget } from "../src/DomTarget";
import { Part } from "../src/Part";

describe("DomTarget", () => {
  it("should have {start, end, isSVG}", () => {
    const test = new DomTarget();
    expect(test.start).to.equal(undefined);
    expect(test.end).to.equal(undefined);
    const keys = Object.keys(test);
    expect(keys.indexOf("end") > -1 && keys.indexOf("start") > -1).to.equal(true);
    expect(test.isSVG).to.equal(false);
  });
  it("should initially set start and end to target in constructor", () => {
    const comment = document.createComment("{{}}");;
    const test = new DomTarget(comment);
    expect(test.start).to.equal(comment);
    expect(test.end).to.equal(comment);
  });
  it("should properly identify first and last", () => {
    const fragment = document.createDocumentFragment();
    const partNode = document.createComment("{{}}");
    fragment.appendChild(partNode);
    const t1 = new DomTarget();
    t1.start = new Part([0], partNode, 0, false);
    t1.end = new Part([1], partNode, 0, false);
    expect(t1.first()).to.equal(partNode);
    expect(t1.last()).to.equal(partNode);
    t1.start = partNode;
    t1.end = partNode;
    expect(t1.first()).to.equal(partNode);
    expect(t1.last()).to.equal(partNode);
  });
  it("should proplery remove itself from the dom", () => {
    const fragment = document.createDocumentFragment();
    const partNode = document.createComment("{{1}}");
    fragment.appendChild(partNode);
    const t1 = new DomTarget(partNode);
    expect(t1.remove().firstChild.nodeValue).to.equal("{{1}}");
    fragment.appendChild(partNode);
    const partNode1 = document.createComment("{{2}}");
    fragment.appendChild(partNode1);
    t1.start = partNode;
    t1.end = partNode1;
    const removedFragment = t1.remove();
    expect(removedFragment.firstChild).to.equal(partNode);
    expect(removedFragment.lastChild).to.equal(partNode1);
  })
});
