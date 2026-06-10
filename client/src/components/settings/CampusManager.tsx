import { useState } from "react";
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
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";

const PRESET_COLORS = [
  "#E8913A", "#6366f1", "#10b981", "#2D9B6F", "#f43f5e",
  "#3b82f6", "#a855f7", "#f59e0b", "#14b8a6", "#6B7280",
  "#ec4899", "#84cc16", "#0ea5e9", "#8b5cf6", "#ef4444",
];

interface EditState {
  id: number;
  name: string;
  color: string;
}

export function CampusManager() {
  const utils = trpc.useUtils();
  const campusesQuery = trpc.calendar.getCampuses.useQuery();
  const campuses = campusesQuery.data ?? [];

  const updateMutation = trpc.calendar.updateCampus.useMutation({
    onSuccess: () => {
      utils.calendar.getCampuses.invalidate();
      toast.success("Campus updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.calendar.createCampus.useMutation({
    onSuccess: () => {
      utils.calendar.getCampuses.invalidate();
      toast.success("Campus created");
      setNewName("");
      setNewColor("#6B7280");
      setShowAdd(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.calendar.deleteCampus.useMutation({
    onSuccess: () => {
      utils.calendar.getCampuses.invalidate();
      toast.success("Campus deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6B7280");

  const startEdit = (c: typeof campuses[0]) => {
    setEditState({ id: c.id, name: c.name, color: c.color });
  };

  const cancelEdit = () => setEditState(null);

  const saveEdit = () => {
    if (!editState) return;
    if (!editState.name.trim()) { toast.error("Name cannot be empty"); return; }
    updateMutation.mutate({ id: editState.id, name: editState.name.trim(), color: editState.color });
    setEditState(null);
  };

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Name is required"); return; }
    createMutation.mutate({ name: newName.trim(), color: newColor });
  };

  return (
    <div className="space-y-3">
      {/* Campus rows */}
      <div className="rounded-lg border border-border overflow-hidden">
        {campuses.length === 0 && (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">No campuses yet.</div>
        )}
        {campuses.map((c) => {
          const isEditing = editState?.id === c.id;
          return (
            <div
              key={c.id}
              className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 ${isEditing ? "bg-muted/30" : "bg-card hover:bg-muted/10"} transition-colors`}
            >
              {/* Color swatch / picker */}
              {isEditing ? (
                <input
                  type="color"
                  value={editState.color}
                  onChange={(e) => setEditState({ ...editState, color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5 flex-shrink-0"
                  title="Pick color"
                />
              ) : (
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0 border border-white/20"
                  style={{ backgroundColor: c.color }}
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
                <span className="flex-1 text-sm font-medium text-foreground">{c.name}</span>
              )}

              {/* Preset color swatches (edit mode) */}
              {isEditing && (
                <div className="flex flex-wrap gap-1 max-w-[160px]">
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col}
                      className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${editState.color === col ? "border-white" : "border-transparent"}`}
                      style={{ backgroundColor: col }}
                      onClick={() => setEditState({ ...editState, color: col })}
                      title={col}
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
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => startEdit(c)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
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

      {/* Add new campus */}
      {showAdd ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Campus</p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5 flex-shrink-0"
            />
            <Input
              placeholder="Campus name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm bg-input"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowAdd(false); }}
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESET_COLORS.map((col) => (
              <button
                key={col}
                className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${newColor === col ? "border-white" : "border-transparent"}`}
                style={{ backgroundColor: col }}
                onClick={() => setNewColor(col)}
                title={col}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Campus"}
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
          Add Campus
        </Button>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}" campus?</AlertDialogTitle>
            <AlertDialogDescription>
              This campus will be permanently deleted. If any events are assigned to this campus,
              deletion will be blocked — reassign those events first.
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
