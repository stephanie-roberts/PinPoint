import Alpine from "alpinejs";
import "../css/site.css";

import Inbox from "./components/inbox.js";

window.Alpine = Alpine;

Alpine.data("inbox", Inbox);

Alpine.start();
