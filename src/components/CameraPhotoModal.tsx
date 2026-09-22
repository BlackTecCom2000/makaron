import React, { useState } from 'react';
import { Camera, X, Check, MapPin, Clock, Upload } from 'lucide-react';

interface CameraPhotoModalProps {
  onSave: (photoUrl: string) => void;
  onCancel: () => void;
  title?: string;
  orderNumber?: string;
  targetName?: string;
}

export const CameraPhotoModal: React.FC<CameraPhotoModalProps> = ({
  onSave,
  onCancel,
  title = 'Фотофиксация операции',
  orderNumber = '#000152',
  targetName = 'Торговая точка'
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const now = new Date();
  const timeString = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU');
  const gpsString = '38.5358° N, 68.7790° E (Душанбе)';

  // Эмуляция выбора фото или создание тестового холста с водяным знаком
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        applyWatermark(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const createMockPhoto = () => {
    // Генерация реалистичного макета фотографии разгрузки мешков макарон
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Градиент фона (кузов авто / склад / вход в магазин)
    const grad = ctx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, '#334155');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Рисуем стилизованные мешки продукции
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;

    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.roundRect(100 + i * 110, 160, 95, 180, [15]);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('МАКАРОНЫ', 110 + i * 110, 230);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('23 КГ', 125 + i * 110, 260);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.fillText('BlackTecCom', 112 + i * 110, 280);
      ctx.fillStyle = '#f8fafc';
    }

    // Водяной знак штампа времени и GPS
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 400, 640, 80);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`НАКЛАДНАЯ: ${orderNumber} | ${targetName}`, 20, 425);

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.fillText(`ВРЕМЯ: ${timeString} UTC+5`, 20, 448);
    ctx.fillText(`GPS: ${gpsString} | ПОГРЕШНОСТЬ ±3м`, 20, 468);

    setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
  };

  const applyWatermark = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 640;
      canvas.height = img.height || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Плашка метаданных
      const bannerHeight = Math.max(70, canvas.height * 0.15);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0, canvas.height - bannerHeight, canvas.width, bannerHeight);

      ctx.fillStyle = '#f59e0b';
      ctx.font = `bold ${Math.round(bannerHeight * 0.22)}px monospace`;
      ctx.fillText(`ЗАКАЗ: ${orderNumber} | ${targetName}`, 20, canvas.height - bannerHeight + 25);

      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.round(bannerHeight * 0.18)}px monospace`;
      ctx.fillText(`ВРЕМЯ: ${timeString}`, 20, canvas.height - bannerHeight + 48);
      ctx.fillText(`GPS: ${gpsString}`, 20, canvas.height - bannerHeight + 68);

      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Camera className="w-5 h-5 text-amber-400" />
            <span>{title}</span>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-100 rounded-xl p-3 text-xs space-y-1 text-slate-700 border border-slate-200">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <span className="text-indigo-600">Заказ:</span> {orderNumber} — {targetName}
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{timeString}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
              <span>{gpsString}</span>
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-slate-950 flex flex-col items-center justify-center min-h-[260px] relative">
            {previewUrl ? (
              <img src={previewUrl} alt="Снимок подтверждения" className="w-full h-auto object-cover max-h-[300px]" />
            ) : (
              <div className="text-center p-6 text-slate-400 space-y-3">
                <Camera className="w-12 h-12 mx-auto text-slate-600" />
                <p className="text-sm">Сделайте снимок продукции или выгрузки</p>
                <div className="flex flex-wrap gap-2 justify-center pt-2">
                  <button
                    type="button"
                    onClick={createMockPhoto}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Camera className="w-4 h-4" />
                    Сделать снимок (Камера)
                  </button>
                  <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition">
                    <Upload className="w-4 h-4" />
                    Загрузить файл
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  </label>
                </div>
              </div>
            )}
          </div>

          {previewUrl && (
            <div className="flex justify-between items-center text-xs text-emerald-700 font-medium bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
              <span className="flex items-center gap-1">
                <Check className="w-4 h-4 text-emerald-600" />
                Водяной знак времени и координат успешно внедрен
              </span>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="text-slate-500 hover:text-slate-800 underline"
              >
                Переснять
              </button>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 px-4 border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-100 transition-colors text-sm"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => previewUrl && onSave(previewUrl)}
              disabled={!previewUrl}
              className="flex-1 py-2.5 px-4 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" />
              Прикрепить к заказу
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
