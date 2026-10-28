import ContactForm from '../components/ContactForm.jsx';

// Reserva de reunión. Provisional: el formulario de la v1.0 dentro de un panel con scroll propio.
export default function CalendarView() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <ContactForm />
    </div>
  );
}
