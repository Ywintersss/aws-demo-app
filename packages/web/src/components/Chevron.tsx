import type { JSX } from "react";

/** Chevron arrow in the board's own stroke — the one icon the UI needs,
 * drawn as thin linework, inheriting currentColor. */
export const Chevron = ({ className }: { className?: string }): JSX.Element => (
	<svg
		className={className}
		width="14"
		height="14"
		viewBox="0 0 14 14"
		fill="none"
		aria-hidden="true"
	>
		<path
			d="M5 2.5 L10 7 L5 11.5"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

/** Back chevron, mirrored. */
export const ChevronBack = ({
	className,
}: {
	className?: string;
}): JSX.Element => (
	<svg
		className={className}
		width="14"
		height="14"
		viewBox="0 0 14 14"
		fill="none"
		aria-hidden="true"
	>
		<path
			d="M9 2.5 L4 7 L9 11.5"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);
