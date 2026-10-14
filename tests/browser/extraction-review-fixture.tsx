import {createRoot} from 'react-dom/client';
import {KnowledgeExtractionReview} from '../../src/components/knowledge-extraction-review';

createRoot(document.getElementById('root')!).render(<KnowledgeExtractionReview jobId="12345678-1234-4234-8234-123456789abc" onClose={()=>{}}/>);
