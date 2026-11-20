import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
const window = new Window({ url: "http://localhost:5173" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "MutationObserver", "getComputedStyle"])
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : (window as any)[key],
    configurable: true,
  });
const React = await import("react");
const { render, screen, fireEvent, cleanup } = await import("@testing-library/react");
const { default: Select } = await import("../src/ui/Select");

test("custom select opens a styled list, picks an option and reports it like a native change", () => {
  const seen: string[] = [];
  function Harness() {
    const [value, setValue] = React.useState("5v5");
    return React.createElement(
      Select,
      { "aria-label": "Situation", value, onChange: (e) => { seen.push(e.target.value); setValue(e.target.value); } },
      React.createElement("option", { value: "5v5" }, "Even strength"),
      React.createElement(React.Fragment, null, React.createElement("option", { value: "5v4" }, "Power play 5-on-4")),
    );
  }
  const { container } = render(React.createElement(Harness));
  const trigger = container.querySelector(".ui-select-trigger")!;
  assert.equal(trigger.textContent, "Even strength");
  fireEvent.click(trigger);
  const option = [...document.querySelectorAll(".ui-select-pop button")].find((b) => b.textContent === "Power play 5-on-4")!;
  fireEvent.click(option);
  assert.deepEqual(seen, ["5v4"]);
  assert.equal(container.querySelector(".ui-select-trigger")!.textContent, "Power play 5-on-4");
  assert.equal(document.querySelector(".ui-select-pop"), null, "list closes after a pick");
  // The hidden native select still works for keyboard and tests.
  fireEvent.change(screen.getByLabelText("Situation"), { target: { value: "5v5" } });
  assert.deepEqual(seen, ["5v4", "5v5"]);
  cleanup();
});
