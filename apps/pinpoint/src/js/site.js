import Alpine from "alpinejs";

import Inbox from "./components/inbox.js";

window.Alpine = Alpine;

Alpine.data("inbox", Inbox);

Alpine.start();
