import { Download } from 'lucide-react';
import { useState } from 'react';
import { api, apiConfig, getErrorMessage, type Ticket } from '@/api';
import { downloadBlob } from '@/shared/lib/files';
import { Button, ButtonLink, useToast } from '@/shared/ui';
import { ticketPdfUrl } from './pdf';

interface Props {
  ticket: Ticket;
  accessToken?: string;
  fullWidth?: boolean;
}

export function TicketPdfButton({ ticket, accessToken, fullWidth }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function download(): Promise<void> {
    setLoading(true);
    try {
      const file = await api.tickets.downloadPdf(ticket.id, accessToken);
      downloadBlob(file, `${ticket.code}.pdf`);
    } catch (error) {
      toast(getErrorMessage(error), 'danger');
    } finally {
      setLoading(false);
    }
  }

  const icon = <Download size={16} />;
  if (apiConfig.mode === 'mock') {
    return (
      <ButtonLink to={ticketPdfUrl(ticket.id, accessToken)} target="_blank" variant="secondary" fullWidth={fullWidth} icon={icon}>
        Скачать PDF
      </ButtonLink>
    );
  }

  return (
    <Button variant="secondary" fullWidth={fullWidth} loading={loading} icon={icon} onClick={download}>
      Скачать PDF
    </Button>
  );
}
