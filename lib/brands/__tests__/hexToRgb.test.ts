import { describe, it, expect } from "vitest";
import { hexToRgbChannels, hexToPdfLibRgb } from "../hexToRgb";

describe("hexToRgbChannels", () => {
  it("should convert #003f27 to '0 63 39'", () => {
    expect(hexToRgbChannels("#003f27")).toBe("0 63 39");
  });

  it("should convert #a57626 to '165 118 38'", () => {
    expect(hexToRgbChannels("#a57626")).toBe("165 118 38");
  });

  it("should convert #FFFFFF to '255 255 255'", () => {
    expect(hexToRgbChannels("#FFFFFF")).toBe("255 255 255");
  });

  it("should throw on invalid hex", () => {
    expect(() => hexToRgbChannels("003f27")).toThrow();
    expect(() => hexToRgbChannels("#GGG")).toThrow();
    expect(() => hexToRgbChannels("")).toThrow();
  });
});

describe("hexToPdfLibRgb", () => {
  it("should convert #003f27 to rgb(0/255, 63/255, 39/255)", () => {
    const result = hexToPdfLibRgb("#003f27");
    expect(result.red).toBeCloseTo(0 / 255, 4);
    expect(result.green).toBeCloseTo(63 / 255, 4);
    expect(result.blue).toBeCloseTo(39 / 255, 4);
  });

  it("should convert #000000 to rgb(0, 0, 0)", () => {
    const result = hexToPdfLibRgb("#000000");
    expect(result.red).toBe(0);
    expect(result.green).toBe(0);
    expect(result.blue).toBe(0);
  });
});
