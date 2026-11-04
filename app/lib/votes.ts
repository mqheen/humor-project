// "No votes yet", "▲ 1 vote", "▲ 12 votes". Score is the net of up and down votes.
export function scoreLabel(score: number) {
    if (score === 0) return 'No votes yet';
    return `▲ ${score} ${score === 1 ? 'vote' : 'votes'}`;
}
