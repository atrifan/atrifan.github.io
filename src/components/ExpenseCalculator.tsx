import React, { Component } from 'react';
import { CURRENCY_SYMBOLS, Currency } from '../types/budget';

interface ExpenseItem {
  id: string;
  description: string;
  amount: string;
}

interface ExpenseCalculatorProps {
  currency: Currency;
  initialValue: number;
  onSave: (total: number) => void;
  onClose: () => void;
}

interface ExpenseCalculatorState {
  items: ExpenseItem[];
}

const inputStyle: React.CSSProperties = {
  padding: '0.75rem',
  fontSize: '1rem',
  background: 'rgba(255, 255, 255, 0.95)',
  border: 'none',
  borderRadius: '8px',
  outline: 'none',
  color: '#1a1a2e',
};

export class ExpenseCalculator extends Component<ExpenseCalculatorProps, ExpenseCalculatorState> {
  constructor(props: ExpenseCalculatorProps) {
    super(props);
    this.state = {
      items: [
        { id: '1', description: 'Rent', amount: '' },
        { id: '2', description: 'Utilities', amount: '' },
        { id: '3', description: 'Internet', amount: '' },
        { id: '4', description: 'Phone', amount: '' },
        { id: '5', description: 'Subscriptions', amount: '' },
        { id: '6', description: '', amount: '' },
      ],
    };
  }

  private getTotal(): number {
    return this.state.items.reduce((sum, item) => {
      const val = parseFloat(item.amount) || 0;
      return sum + val;
    }, 0);
  }

  private updateItem(id: string, field: 'description' | 'amount', value: string) {
    this.setState(prev => ({
      items: prev.items.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  }

  private addRow = () => {
    this.setState(prev => ({
      items: [...prev.items, { id: Date.now().toString(), description: '', amount: '' }],
    }));
  };

  private removeRow = (id: string) => {
    this.setState(prev => ({
      items: prev.items.filter(item => item.id !== id),
    }));
  };

  private handleSave = () => {
    this.props.onSave(this.getTotal());
  };

  render() {
    const { currency, onClose } = this.props;
    const symbol = CURRENCY_SYMBOLS[currency];
    const total = this.getTotal();

    return (
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: '24px',
          padding: '2rem',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
              🧮 Expense Calculator
            </h3>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
              fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem',
            }}>✕</button>
          </div>

          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Add your monthly fixed expenses below. The total will be calculated automatically.
          </p>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 40px', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', paddingLeft: '0.75rem' }}>Description</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', textAlign: 'right', paddingRight: '0.75rem' }}>{symbol}</span>
            <span></span>
          </div>

          {/* Items */}
          {this.state.items.map((item) => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 40px', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={item.description}
                onChange={(e) => this.updateItem(item.id, 'description', e.target.value)}
                placeholder="What for..."
                style={inputStyle}
              />
              <input
                type="number"
                value={item.amount}
                onChange={(e) => this.updateItem(item.id, 'amount', e.target.value)}
                placeholder="0"
                style={{ ...inputStyle, textAlign: 'right' }}
              />
              <button onClick={() => this.removeRow(item.id)} style={{
                background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '8px',
                color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer',
              }}>−</button>
            </div>
          ))}

          {/* Add Row */}
          <button onClick={this.addRow} style={{
            width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.1)',
            border: '2px dashed rgba(255,255,255,0.3)', borderRadius: '8px',
            color: 'rgba(255,255,255,0.7)', fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem',
          }}>
            + Add Row
          </button>

          {/* Total */}
          <div style={{
            marginTop: '1.5rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.2)',
            borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 600 }}>Total:</span>
            <span style={{ color: '#10b981', fontSize: '1.8rem', fontWeight: 800 }}>
              {symbol}{total.toLocaleString()}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '1rem', background: 'rgba(255,255,255,0.1)',
              border: '2px solid rgba(255,255,255,0.3)', borderRadius: '12px',
              color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={this.handleSave} style={{
              flex: 1, padding: '1rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none', borderRadius: '12px',
              color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
            }}>✓ Use This Total</button>
          </div>
        </div>
      </div>
    );
  }
}

