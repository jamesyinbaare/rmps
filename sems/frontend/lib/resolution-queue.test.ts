import { nextIndexAfterRemoval } from "./resolution-queue";

describe("nextIndexAfterRemoval", () => {
  it("returns -1 when list is empty", () => {
    expect(nextIndexAfterRemoval(3, 0)).toBe(-1);
  });

  it("clamps to last index when removing last item", () => {
    expect(nextIndexAfterRemoval(4, 4)).toBe(3);
  });

  it("keeps index when removing earlier item", () => {
    expect(nextIndexAfterRemoval(2, 4)).toBe(2);
  });

  it("handles first item removal", () => {
    expect(nextIndexAfterRemoval(0, 2)).toBe(0);
  });
});
