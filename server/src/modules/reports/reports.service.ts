import OpenAI from 'openai';

const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY missing');
  }
  return new OpenAI({ apiKey });
};

export const reportsService = {
  async generateSummary(metrics: Record<string, unknown>) {
    try {
      const openai = getOpenAIClient();
      const response = await openai.responses.create({
        model: 'gpt-4.1-mini',
        input: `Generate a brief social media performance summary using the following metrics: ${JSON.stringify(
          metrics,
        )}`,
      });
      if (response.output_text) {
        return response.output_text;
      }
      return 'Summary not available';
    } catch (error) {
      console.error('OpenAI summary failed', error);
      return 'Summary not available';
    }
  },
};
