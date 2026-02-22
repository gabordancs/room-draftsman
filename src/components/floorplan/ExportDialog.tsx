import React, { useState, useRef } from 'react';
import { FloorplanState } from '@/types/floorplan';
import { validateFloorplan, ValidationError, downloadJSON, exportXLSX, importJSON } from '@/utils/exportImport';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Download, Upload, FileSpreadsheet, FileJson, X } from 'lucide-react';

interface Props {
  state: FloorplanState;
  onImport: (state: FloorplanState) => void;
}

export default function ExportDialog({ state, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [validated, setValidated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      const errs = validateFloorplan(state);
      setErrors(errs);
      setValidated(true);
    } else {
      setValidated(false);
    }
  };

  const criticalErrors = errors.filter(e => e.type === 'error');
  const warnings = errors.filter(e => e.type === 'warning');
  const canExport = criticalErrors.length === 0;

  const handleExportJSON = () => {
    downloadJSON(state);
  };

  const handleExportXLSX = async () => {
    await exportXLSX(state);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importJSON(reader.result as string);
      if (result) {
        onImport(result);
        setOpen(false);
      } else {
        alert('Érvénytelen JSON fájl.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
          <Download className="h-3.5 w-3.5" />
          Export / Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Export & Import</DialogTitle>
        </DialogHeader>

        {/* Validation results */}
        {validated && (
          <div className="space-y-2">
            {errors.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-500 bg-green-500/10 rounded-md p-3">
                <CheckCircle2 className="h-4 w-4" />
                <span>Minden rendben, exportálható.</span>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {criticalErrors.map((err, i) => (
                  <div key={`e-${i}`} className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{err.message}</span>
                  </div>
                ))}
                {warnings.map((err, i) => (
                  <div key={`w-${i}`} className="flex items-start gap-2 text-xs text-yellow-500 bg-yellow-500/10 rounded-md p-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{err.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Export buttons */}
        <div className="space-y-2 pt-2">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Exportálás</p>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleExportJSON}
              disabled={!canExport}
            >
              <FileJson className="h-4 w-4" />
              JSON
            </Button>
            <Button
              variant="default"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleExportXLSX}
              disabled={!canExport}
            >
              <FileSpreadsheet className="h-4 w-4" />
              XLSX (WinWatt)
            </Button>
          </div>
          {!canExport && (
            <p className="text-xs text-destructive">Javítsd a hibákat az exportálás előtt.</p>
          )}
        </div>

        {/* Import */}
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Importálás</p>
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={handleImport}>
            <Upload className="h-4 w-4" />
            JSON betöltése
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-xs text-muted-foreground">
            Korábban exportált JSON projekt visszatöltése.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
