import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { CalendarEventRow, statusClass, statusLabel } from "@/lib/calendarUtils";
import { EventFormDialog } from "./EventFormDialog";
import { format } from "date-fns";
import {
  MapPin, Clock, Users, Building2, CheckCircle2,
  XCircle, Lock, Unlock, Send, AlertTriangle, Pencil
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  event: CalendarEventRow | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function EventDetailDrawer({ event, open, onClose, onRefresh }: Props) {
  const [comment, setComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const historyQuery = trpc.calendar.getApprovalHistory.useQuery(
    { eventId: event?.event.id ?? 0 },
    { enabled: !!event && open }
  );

  const conflictsQuery = trpc.calendar.getConflicts.useQuery(
    { resolved: false },
    { enabled: !!event && open }
  );

  const approveMutation = trpc.calendar.approveEvent.useMutation({
    onSuccess: () => { toast.success("Event approved"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.calendar.rejectEvent.useMutation({
    onSuccess: () => { toast.success("Event rejected"); setShowRejectForm(false); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const commentMutation = trpc.calendar.addComment.useMutation({
    onSuccess: () => { setComment(""); historyQuery.refetch(); toast.success("Comment added"); },
  });

  const submitMutation = trpc.calendar.submitForApproval.useMutation({
    onSuccess: () => { toast.success("Submitted for approval"); onRefresh(); },
  });

  const lockMutation = trpc.calendar.approveEvent.useMutation({
    onSuccess: () => { toast.success("Event locked"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  if (!event) return null;
  const { event: ev, ministry, campus } = event;
  const eventConflicts = conflictsQuery.data?.filter(
    (c) => c.conflict.eventAId === ev.id
  ) ?? [];

  const actionLabel: Record<string, string> = {
    submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
    changes_requested: "Changes Requested",
    comment: "Comment",
    moved: "Moved",
    locked: "Locked",
    unlocked: "Unlocked",
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-card border-border overflow-y-auto p-0">
        {/* Edit form */}
        {showEditForm && (
          <EventFormDialog
            open={showEditForm}
            onClose={() => setShowEditForm(false)}
            onSaved={() => { setShowEditForm(false); onRefresh(); }}
            editEvent={{
              id: ev.id,
              title: ev.title,
              description: ev.description,
              campusId: ev.campusId,
              ministryId: ev.ministryId,
              location: ev.location,
              capacity: ev.capacity,
              startDate: new Date(ev.startDate),
              endDate: new Date(ev.endDate),
              isAllDay: ev.isAllDay,
              status: ev.status,
              attendeeNotes: ev.attendeeNotes,
            }}
          />
        )}

        {/* Header */}
        <div className="p-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3 mb-3">
            <SheetTitle className="text-lg font-bold text-foreground leading-tight">
              {ev.title}
            </SheetTitle>
            <div className="flex items-center gap-1.5">
              <span className={`ministry-pill text-xs shrink-0 ${statusClass(ev.status as any)}`}>
                {statusLabel(ev.status as any)}
              </span>
              {ev.status !== "locked" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowEditForm(true)}
                  title="Edit event"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
          {/* Ministry + Campus tags */}
          <div className="flex flex-wrap gap-2">
            {ministry && (
              <span
                className="ministry-pill text-xs"
                style={{ backgroundColor: ministry.color + "22", color: ministry.color, border: `1px solid ${ministry.color}44` }}
              >
                {ministry.name}
              </span>
            )}
            {campus && (
              <span className="ministry-pill text-xs bg-secondary text-secondary-foreground">
                <Building2 className="w-3 h-3" /> {campus.name}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Date/Time */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4 text-primary" />
              <span>
                {format(new Date(ev.startDate), "EEEE, MMMM d, yyyy")}
                {!ev.isAllDay && (
                  <> · {format(new Date(ev.startDate), "h:mm a")} – {format(new Date(ev.endDate), "h:mm a")}</>
                )}
                {ev.isAllDay && " · All Day"}
              </span>
            </div>
            {ev.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary" />
                <span>{ev.location}</span>
              </div>
            )}
            {ev.capacity && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4 text-primary" />
                <span>Capacity: {ev.capacity}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {ev.description && (
            <>
              <Separator />
              <p className="text-sm text-muted-foreground leading-relaxed">{ev.description}</p>
            </>
          )}

          {/* Attendee Notes */}
          {ev.attendeeNotes && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Attendee Notes</p>
                <p className="text-sm text-foreground">{ev.attendeeNotes}</p>
              </div>
            </>
          )}

          {/* Conflicts */}
          {eventConflicts.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-yellow-400" /> Conflicts
                </p>
                <div className="space-y-1.5">
                  {eventConflicts.map((c) => (
                    <div key={c.conflict.id} className={`text-xs px-2 py-1.5 rounded ${c.conflict.severity === "critical" ? "conflict-critical" : c.conflict.severity === "warning" ? "conflict-warning" : "conflict-info"}`}>
                      {c.conflict.notes}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Rejection reason */}
          {ev.rejectionReason && (
            <>
              <Separator />
              <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                <p className="text-xs font-semibold text-red-400 mb-1">Rejection Reason</p>
                <p className="text-sm text-red-300">{ev.rejectionReason}</p>
              </div>
            </>
          )}

          {/* Approval Actions */}
          {ev.status === "approved" && (
            <>
              <Separator />
              <Button
                size="sm"
                variant="outline"
                className="w-full border-primary/40 text-primary hover:bg-primary/10 gap-1"
                onClick={() => lockMutation.mutate({ eventId: ev.id, actorName: "Admin", lock: true })}
                disabled={lockMutation.isPending}
              >
                <Lock className="w-3.5 h-3.5" /> Lock Event
              </Button>
            </>
          )}

          {ev.status === "locked" && (
            <>
              <Separator />
              <Button
                size="sm"
                variant="outline"
                className="w-full border-muted text-muted-foreground hover:bg-secondary/50 gap-1"
                onClick={() => approveMutation.mutate({ eventId: ev.id, actorName: "Admin", lock: false })}
                disabled={approveMutation.isPending}
              >
                <Unlock className="w-3.5 h-3.5" /> Unlock Event
              </Button>
            </>
          )}

          {ev.status === "pending_approval" && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Review</p>
                {!showRejectForm ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-500 text-white"
                      onClick={() => approveMutation.mutate({ eventId: ev.id, actorName: "Admin" })}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                      onClick={() => setShowRejectForm(true)}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Reason for rejection..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="bg-input border-border text-sm min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-red-600 hover:bg-red-500 text-white"
                        onClick={() => rejectMutation.mutate({ eventId: ev.id, reason: rejectReason, actorName: "Admin" })}
                        disabled={!rejectReason || rejectMutation.isPending}
                      >
                        Confirm Rejection
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowRejectForm(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {ev.status === "draft" && (
            <>
              <Separator />
              <Button
                size="sm"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => submitMutation.mutate({ eventId: ev.id })}
                disabled={submitMutation.isPending}
              >
                <Send className="w-3.5 h-3.5 mr-1" /> Submit for Approval
              </Button>
            </>
          )}

          {/* Approval History / Comments */}
          <Separator />
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Activity
            </p>
            <div className="space-y-3 mb-4">
              {historyQuery.data?.map((h) => (
                <div key={h.id} className="flex gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-foreground">
                        {h.actorName ?? "System"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {actionLabel[h.action] ?? h.action}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(h.createdAt), "MMM d, h:mm a")}
                      </span>
                    </div>
                    {h.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{h.notes}</p>
                    )}
                  </div>
                </div>
              ))}
              {historyQuery.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">No activity yet.</p>
              )}
            </div>

            {/* Add comment */}
            <div className="flex gap-2">
              <Textarea
                placeholder="Add a comment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="bg-input border-border text-sm min-h-[60px] resize-none"
              />
              <Button
                size="sm"
                className="self-end bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={!comment || commentMutation.isPending}
                onClick={() => commentMutation.mutate({ eventId: ev.id, comment, actorName: "Admin" })}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
