import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GripVertical, Pencil, Trash2, Check, X, Plus } from "lucide-react";

const PRESET_COLORS = [
  "#E8913A", "#6366f1", "#10b981", "#2D9B6F", "#f43f5e",
  "#3b82f6", "#a855f7", "#f59e0b", "#14b8a6", "#6B7280",
  "#ec4899", "#84cc16", "#0ea5e9", "#8b5cf6", "#ef4444",
];

interface EditState {
  id: number;
  name: string;
  color: string;
  icon: string;
}

export function MinistryManager() {
  const utils = trpc.useUtils();
  const ministriesQuery = trpc.calendar.getMinistries.useQuery();
  const ministries = ministriesQuery.data ?? [];

  const updateMutation = trpc.calendar.updateMinistry.useMutation({
    onSuccess: () => {
      utils.calendar.getMinistries.invalidate();
      toast.success("Ministry updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.calendar.createMinistry.useMutation({
    onSuccess: () => {
      utils.calendar.getMinistries.invalidate();
      toast.success("Ministry created");
      setNewName("");
      setNewColor("#6B7280");
      setShowAdd(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.calendar.deleteMinistry.useMutation({
    onSuccess: () => {
      utils.calendar.getMinistries.invalidate();
      toast.success("Ministry deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6B7280");

  const startEdit = (m: typeof ministries[0]) => {
    setEditState({ id: m.id, name: m.name, color: m.color, icon: m.icon });
  };

  const cancelEdit = () => setEditState(null);

  const saveEdit = () => {
    if (!editState) return;
    if (!editState.name.trim()) { toast.error("Name cannot be empty"); return; }
    updateMutation.mutate({ id: editState.id, name: editState.name.trim(), color: editState.color, icon: editState.icon });
    setEditState(null);
  };

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Name is required"); return; }
    createMutation.mutate({ name: newName.trim(), color: newColor, sortOrder: ministries.length + 1 });
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const m = ministries[idx];
    const above = ministries[idx - 1];
    updateMutation.mutate({ id: m.id, sortOrder: above.sortOrder });
    updateMutation.mutate({ id: above.id, sortOrder: m.sortOrder });
  };

  const moveDown = (idx: number) => {
    if (idx === ministries.length - 1) return;
    const m = ministries[idx];
    const below = ministries[idx + 1];
    updateMutation.mutate({ id: m.id, sortOrder: below.sortOrder });
    updateMutation.mutate({ id: below.id, sortOrder: m.sortOrder });
  };

  return (
    <div className="space-y-3">
      {/* Ministry rows */}
      <div className="rounded-lg border border-border overflow-hidden">
        {ministries.length === 0 && (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">No ministries yet.</div>
        )}
        {ministries.map((m, idx) => {
          const isEditing = editState?.id === m.id;
          return (
            <div
              key={m.id}
              className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 ${isEditing ? "bg-muted/30" : "bg-card hover:bg-muted/10"} transition-colors`}
            >
              {/* Drag handle / order buttons */}
              <div className="flex flex-col gap-0.5 opacity-40 hover:opacity-80 cursor-default select-none">
                <button
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-[10px] leading-none"
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0 || updateMutation.isPending}
                  title="Move up"
                >▲</button>
                <button
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-[10px] leading-none"
                  onClick={() => moveDown(idx)}
                  disabled={idx === ministries.length - 1 || updateMutation.isPending}
                  title="Move down"
                >▼</button>
              </div>

              {/* Color swatch / picker */}
              {isEditing ? (
                <div className="relative">
                  <input
                    type="color"
                    value={editState.color}
                    onChange={(e) => setEditState({ ...editState, color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5"
                    title="Pick color"
                  />
                </div>
              ) : (
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0 border border-white/20"
                  style={{ backgroundColor: m.color }}
                />
              )}

              {/* Name */}
              {isEditing ? (
                <Input
                  value={editState.name}
                  onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                  className="h-7 text-sm flex-1 bg-input"
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                  autoFocus
                />
              ) : (
                <span className="flex-1 text-sm font-medium text-foreground">{m.name}</span>
              )}

              {/* Preset color swatches (only in edit mode) */}
              {isEditing && (
                <div className="flex flex-wrap gap-1 max-w-[160px]">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${editState.color === c ? "border-white" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEditState({ ...editState, color: c })}
                      title={c}
                    />
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                {isEditing ? (
                  <>
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-green-500 hover:text-green-400" onClick={saveEdit} title="Save">
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-muted-foreground" onClick={cancelEdit} title="Cancel">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => startEdit(m)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget({ id: m.id, name: m.name })}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add new ministry */}
      {showAdd ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Ministry</p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5 flex-shrink-0"
            />
            <Input
              placeholder="Ministry name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm bg-input"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowAdd(false); }}
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${newColor === c ? "border-white" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                onClick={() => setNewColor(c)}
                title={c}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Ministry"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 border-dashed"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Ministry
        </Button>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This ministry will be permanently deleted. This action cannot be undone.
              If any events are assigned to this ministry, deletion will be blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
