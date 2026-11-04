import { useData } from '@/store/data';
import type { Contact, Task } from '@/domain/types';
import { nextLead } from '../autoCall';

// The toast/dialog layer drags Reanimated in; nextLead never touches it
jest.mock('@/components/feedback', () => ({ alertDialog: jest.fn(), notify: jest.fn() }));

const contact = (id: string): Contact =>
  ({ id, name: id, phone: '+910000000000', dnc: false, updatedAt: '2026-01-01T00:00:00Z' }) as unknown as Contact;

const task = (id: string, contactId: string, dueAt: string): Task =>
  ({
    id,
    kind: 'callback',
    title: id,
    contactId,
    number: '',
    dueAt,
    slaDueAt: null,
    notes: '',
    done: false,
    createdFromCallId: null,
    updatedAt: dueAt,
  }) as Task;

const NOW = new Date('2026-11-02T10:00:00Z').getTime();

describe('nextLead', () => {
  it('skips callbacks whose time has not come yet', () => {
    useData.setState({
      contacts: [contact('ct_a'), contact('ct_b')],
      tasks: [task('tk_future', 'ct_a', '2026-11-03T10:00:00Z')],
      calls: [],
    });
    const lead = nextLead(NOW);
    expect(lead?.taskId).toBeNull();
  });

  it('picks the earliest callback that is already due', () => {
    useData.setState({
      contacts: [contact('ct_a'), contact('ct_b')],
      tasks: [task('tk_later', 'ct_a', '2026-11-02T09:30:00Z'), task('tk_first', 'ct_b', '2026-11-02T08:00:00Z')],
      calls: [],
    });
    expect(nextLead(NOW)?.taskId).toBe('tk_first');
  });
});
