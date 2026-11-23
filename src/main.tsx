import { render } from "preact";
import { App } from "./app";
import { initCrash } from "./lib/crash";
import { getUserId } from "./lib/user";
import "./style.css";

initCrash(getUserId());

render(<App />, document.getElementById("app")!);
