import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultDate?: Date;
  defaultCampusId?: number;
  editEvent?: {
    id: number;
    title: string;
    description: string | null;
    campusId: number;
    ministryId: number;
    location: string | null;
    capacity: number | null;
    startDate: Date;
    endDate: Date;
    isAllDay: boolean;
    status: string;
    attendeeNotes: string | null;
  };
}

export function EventFormDialog({ open, onClose, onSaved, defaultDate, defaultCampusId, editEvent }: Props) {
  const isEdit = !!editEvent;
  const campusesQuery = trpc.calendar.getCampuses.useQuery();
  const ministriesQuery = trpc.calendar.getMinistries.useQuery();

  const now = defaultDate ?? new Date();
  const defaultStart = format(now, "yyyy-MM-dd") + "T09:00";
  const defaultEnd = format(now, "yyyy-MM-dd") + "T11:00";

  const [form, setForm] = useState({
    title: "",
    description: "",
    campusId: defaultCampusId?.toString() ?? "",
    ministryId: "",
    location: "",
    capacity: "",
    startDate: defaultStart,
    endDate: defaultEnd,
    isAllDay: false,
    status: "draft" as string,
    attendeeNotes: "",
  });

  const [conflicts, setConflicts] = useState<Array<{ type: string; severity: string; message: string }>>([]);

  useEffect(() => {
    if (editEvent) {
      setForm({
        title: editEvent.title,
        description: editEvent.description ?? "",
        campusId: editEvent.campusId.toString(),
        ministryId: editEvent.ministryId.toString(),
        location: editEvent.location ?? "",
        capacity: editEvent.capacity?.toString() ?? "",
        startDate: format(new Date(editEvent.startDate), "yyyy-MM-dd'T'HH:mm"),
        endDate: format(new Date(editEvent.endDate), "yyyy-MM-dd'T'HH:mm"),
        isAllDay: editEvent.isAllDay,
        status: editEvent.status,
        attendeeNotes: editEvent.attendeeNotes ?? "",
      });
    } else {
      setForm((f) => ({
        ...f,
        title: "",
        description: "",
        campusId: defaultCampusId?.toString() ?? "",
        ministryId: "",
        location: "",
        capacity: "",
        startDate: defaultStart,
        endDate: defaultEnd,
        isAllDay: false,
        status: "draft",
        attendeeNotes: "",
      }));
      setConflicts([]);
    }
  }, [editEvent, open]);

  const createMutation = trpc.calendar.createEvent.useMutation({
    onSuccess: (data) => {
      if (data.conflicts.length > 0) {
        setConflicts(data.conflicts);
        toast.warning(`Event saved with ${data.conflicts.length} conflict(s) detected`);
      } else {
        toast.success("Event created");
        onSaved();
        onClose();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.calendar.updateEvent.useMutation({
    onSuccess: () => { toast.success("Event updated"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (submitForApproval = false) => {
    if (!form.title || !form.campusId || !form.ministryId) {
      toast.error("Title, campus, and ministry are required");
      return;
    }
    const status = submitForApproval ? "pending_approval" : form.status;
    const payload = {
      title: form.title,
      description: form.description || undefined,
      campusId: parseInt(form.campusId),
      ministryId: parseInt(form.ministryId),
      location: form.location || undefined,
      capacity: form.capacity ? parseInt(form.capacity) : undefined,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      isAllDay: form.isAllDay,
      status: status as any,
      attendeeNotes: form.attendeeNotes || undefined,
    };

    if (isEdit && editEvent) {
      updateMutation.mutate({ id: editEvent.id, ...payload, actorName: "Admin" });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground font-bold">
            {isEdit ? "Edit Event" : "New Event"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Event title"
              className="bg-input border-border"
            />
          </div>

          {/* Campus + Ministry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Campus *</Label>
              <Select value={form.campusId} onValueChange={(v) => setForm({ ...form, campusId: v })}>
                <SelectTrigger className="bg-input border-border">
                  <SelectValue placeholder="Select campus" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {campusesQuery.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Ministry *</Label>
              <Select value={form.ministryId} onValueChange={(v) => setForm({ ...form, ministryId: v })}>
                <SelectTrigger className="bg-input border-border">
                  <SelectValue placeholder="Select ministry" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {ministriesQuery.data?.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                        {m.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* All Day toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.isAllDay}
              onCheckedChange={(v) => setForm({ ...form, isAllDay: v })}
              id="allday"
            />
            <Label htmlFor="allday" className="text-sm text-muted-foreground cursor-pointer">All Day Event</Label>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Start *</Label>
              <Input
                type={form.isAllDay ? "date" : "datetime-local"}
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">End *</Label>
              <Input
                type={form.isAllDay ? "date" : "datetime-local"}
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="bg-input border-border"
              />
            </div>
          </div>

          {/* Location + Capacity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Room or venue"
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Capacity</Label>
              <Input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                placeholder="Max attendees"
                className="bg-input border-border"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Event details..."
              className="bg-input border-border min-h-[80px] resize-none"
            />
          </div>

          {/* Attendee Notes */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Attendee Notes</Label>
            <Textarea
              value={form.attendeeNotes}
              onChange={(e) => setForm({ ...form, attendeeNotes: e.target.value })}
              placeholder="Notes visible to attendees..."
              className="bg-input border-border min-h-[60px] resize-none"
            />
          </div>

          {/* Conflict warnings */}
          {conflicts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Conflicts Detected
              </p>
              {conflicts.map((c, i) => (
                <div key={i} className={`text-xs px-2 py-1.5 rounded ${c.severity === "critical" ? "conflict-critical" : c.severity === "warning" ? "conflict-warning" : "conflict-info"}`}>
                  {c.message}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant="outline"
            className="border-border"
            onClick={() => handleSubmit(false)}
            disabled={isPending}
          >
            Save as Draft
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => handleSubmit(true)}
            disabled={isPending}
          >
            Submit for Approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
