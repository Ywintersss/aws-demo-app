import type { JSX } from "react";

/** Error surface with an optional retry — the board's way of saying
 * "the request didn't land; try again". */
export const ErrorPanel = ({
	message,
	onRetry,
}: {
	message: string;
	onRetry?: () => void;
}): JSX.Element => (
	<div className="empty error-panel" role="alert">
		<p className="empty-line">{message}</p>
		{onRetry !== undefined && (
			<button type="button" className="btn" onClick={onRetry}>
				Try again
			</button>
		)}
	</div>
);