const dateTime = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

export const formatDateTime = (value: string) => dateTime.format(new Date(value));
export const formatDate = (value: string) => date.format(new Date(value));

export async function copyToClipboard(text: string, fallbackInput?: HTMLInputElement | null) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Plain HTTP outside localhost: select the text and use the legacy command
  fallbackInput?.select();
  document.execCommand('copy');
}
