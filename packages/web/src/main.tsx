import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.js";
import { App } from "./App.js";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
	throw new Error("#root element not found");
}

createRoot(rootElement).render(
	<StrictMode>
		<BrowserRouter>
			<AuthProvider>
				<App />
			</AuthProvider>
		</BrowserRouter>
	</StrictMode>,
);
