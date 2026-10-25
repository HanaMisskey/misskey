export function removeMutedUsersReactions(
	reactions: Record<string, number>,
	mutedReactions: readonly string[],
): Record<string, number> {
	const visible = { ...reactions };
	for (const reaction of mutedReactions) {
		if (visible[reaction] != null) visible[reaction]--;
	}
	for (const reaction of Object.keys(visible)) {
		if (visible[reaction] <= 0) delete visible[reaction];
	}
	return visible;
}
