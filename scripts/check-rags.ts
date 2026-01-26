import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

async function main() {
  const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const supabaseKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars: STORAGE_SUPABASE_URL or STORAGE_SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('user_rags')
    .select('id, name, description, source_type, rag_name')
    .eq('user_id', 'user_38nBvEeObYPkwi0WvTrucxnzul2');

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('RAGs found:', data?.length || 0);
    if (data && data.length > 0) {
      data.forEach(r => console.log('-', r.name, '(tool: default.rag_' + r.name.toLowerCase().replace(/\s+/g, '-') + ')'));
    } else {
      console.log('\nNo RAGs exist for this user. You need to create a RAG knowledge base first.');
    }
  }
}

main();
