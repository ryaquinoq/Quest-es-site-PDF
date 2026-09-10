// Shared boundary keeps answer comments out of the question alternatives.
export const ANSWER_KEY_HEADER = /^[ \t]*(?:#{1,6}[ \t]*)?(?:GABARITO(?:[ \t]+(?:E[ \t]+FEEDBACK[ \t]+DETALHADO|COMENTADO|FINAL|COM[ \t]+JUSTIFICATIVAS))?|FEEDBACK[ \t]+DETALHADO|RESPOSTAS[ \t]+E[ \t]+JUSTIFICATIVAS)[ \t]*:?[ \t]*$/imu;
