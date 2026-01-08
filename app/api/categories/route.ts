/**
 * Tool Categories API
 * 
 * GET /api/categories - List all categories (system + user's custom)
 * POST /api/categories - Create a new custom category
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  is_system: boolean;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

// GET - List all categories
export async function GET() {
  try {
    const { userId } = await auth();

    // Get system categories + user's custom categories
    let query = supabase
      .from('tool_categories')
      .select('*')
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });

    if (userId) {
      query = query.or(`is_system.eq.true,user_id.eq.${userId}`);
    } else {
      query = query.eq('is_system', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching categories:', error);
      // Fallback to static categories
      return NextResponse.json({
        categories: [
          { name: 'Health & Fitness', icon: '💪', isSystem: true },
          { name: 'Finance', icon: '💰', isSystem: true },
          { name: 'Date & Time', icon: '📅', isSystem: true },
          { name: 'Fun & Games', icon: '🎲', isSystem: true },
          { name: 'Utilities', icon: '🔧', isSystem: true },
          { name: 'Astronomy', icon: '🌟', isSystem: true },
        ],
      });
    }

    const categories = (data as CategoryRow[]).map(cat => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      description: cat.description,
      isSystem: cat.is_system,
    }));

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

// POST - Create a new custom category
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, icon, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    // Check if category already exists
    const { data: existing } = await supabase
      .from('tool_categories')
      .select('id')
      .eq('name', name.trim())
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Category already exists' }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('tool_categories')
      .insert({
        name: name.trim(),
        icon: icon || '📦',
        description: description || null,
        is_system: false,
        user_id: userId,
      } as never)
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
    }

    const cat = data as CategoryRow;
    return NextResponse.json({
      category: {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        description: cat.description,
        isSystem: cat.is_system,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating category:', error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

