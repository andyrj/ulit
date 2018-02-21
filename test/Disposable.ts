import { expect } from "chai";
import "mocha";
import { Disposable, IDisposer } from "../src/Disposable";

describe("Disposable", () => {
  it("should have {add,remove}Disposer", () => {
    const test = new Disposable();
    expect(typeof test.addDisposer).to.equal("function");
    expect(typeof test.removeDisposer).to.equal("function");
  });
  it("should have dispose method", () => {
    const test = new Disposable();
    expect(typeof test.dispose).to.equal("function");
  });
  it("should call any disposers added when dispose is called", () => {
    let count = 0;
    const handler: IDisposer = () => {
      count++;
    };
    const test = new Disposable();
    test.addDisposer(handler);
    test.dispose();
    expect(count).to.equal(1);
  });
  it("should not call a disposer after it is removed", () => {
    let count = 0;
    const handler: IDisposer = () => {
      count++;
    };
    const test = new Disposable();
    test.addDisposer(handler);
    test.removeDisposer(handler);
    test.dispose();
    expect(count).to.equal(0);
  });
});