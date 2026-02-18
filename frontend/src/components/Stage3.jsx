import ReactMarkdown from 'react-markdown';
import './Stage3.css';

export default function Stage3({ finalResponse }) {
  if (!finalResponse) {
    return null;
  }

  const responseText = finalResponse.response || '';
  const isError = /unable to generate final synthesis|all models failed|error:/i.test(responseText);

  return (
    <div className={`stage stage3 ${isError ? 'stage3-error' : ''}`}>
      <h3 className="stage-title">Stage 3: Final Council Answer</h3>
      <div className={`final-response ${isError ? 'final-response-error' : ''}`}>
        <div className="chairman-label">
          Chairman: {finalResponse.model.split('/')[1] || finalResponse.model}
        </div>
        <div className="final-text markdown-content">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
        {isError && (
          <div className="stage3-recovery">
            <p className="stage3-recovery-title">Try this:</p>
            <ul>
              <li>Confirm your selected Ollama models are installed and running.</li>
              <li>Reduce `COUNCIL_MODELS` to one fast model and test again.</li>
              <li>Restart backend after updating `.env` settings.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
