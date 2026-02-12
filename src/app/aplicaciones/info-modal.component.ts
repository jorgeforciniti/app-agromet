import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

type BlockKind = 'plain' | 'info' | 'warn' | 'danger';
type BlockLine = { text: string; isBullet: boolean };
type Block = { kind: BlockKind; title?: string; icon?: string; lines: BlockLine[] };

@Component({
  selector: 'app-info-modal',
  template: `
<ion-header class="ion-no-border">
  <ion-toolbar>
    <ion-title>{{ title }}</ion-title>
    <ion-buttons slot="end">
      <ion-button (click)="dismiss()" fill="clear">
        <ion-icon name="close-outline" slot="icon-only"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</ion-header>

<ion-content class="modal-content">
  <div class="wrap">

    <!-- Si body es array de strings -->
    <ng-container *ngIf="isStringArray(body); else htmlBody">
      <section class="section" *ngFor="let block of normalizeBlocks(body)">
        <div class="block" [ngClass]="block.kind">
          <div class="h" *ngIf="block.title">
            <ion-icon *ngIf="block.icon" [name]="block.icon"></ion-icon>
            <span>{{ block.title }}</span>
          </div>

          <div class="p" *ngFor="let line of block.lines">
            <span class="bullet" *ngIf="line.isBullet">•</span>
            <span class="text">{{ line.text }}</span>
          </div>
        </div>
      </section>
    </ng-container>

    <!-- Si body viene como HTML string -->
    <ng-template #htmlBody>
      <div class="html" [innerHTML]="body"></div>
    </ng-template>

  </div>
</ion-content>
  `,
  styles: [`
:host{
  --pad: 14px;
}

.modal-content{
  --background: #0b0f14;
}

.wrap{
  padding: var(--pad);
}

.section{
  margin-bottom: 12px;
}

.block{
  border-radius: 14px;
  padding: 12px 12px 10px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.08);
  backdrop-filter: blur(10px);
}

.block.info{ border-color: rgba(80,200,255,.22); }
.block.warn{ border-color: rgba(255,200,80,.22); }
.block.danger{ border-color: rgba(255,90,90,.22); }

.h{
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  margin-bottom: 8px;
  opacity: .95;
}

.h ion-icon{
  font-size: 18px;
  opacity: .9;
}

.p{
  display: flex;
  gap: 8px;
  padding: 4px 0;
  line-height: 1.25rem;
  opacity: .92;
}

.bullet{
  width: 14px;
  flex: 0 0 14px;
  opacity: .8;
}

.text{
  flex: 1;
}

.html{
  padding: 8px 0;
}
  `]
})
export class InfoModalComponent {
  @Input() title = '';
  @Input() body: any = [];

  constructor(private modalCtrl: ModalController) {}

  dismiss() {
    this.modalCtrl.dismiss();
  }

  isStringArray(v: any): v is string[] {
    return Array.isArray(v) && v.every(x => typeof x === 'string');
  }

  normalizeBlocks(lines: string[]): Block[] {
    const out: Block[] = [];
    let current: Block | null = null;

    const pushBlock = (b: Block | null) => {
      if (!b) return;
      b.lines = b.lines.filter(x => x.text.trim().length > 0);
      if (b.title || b.lines.length) out.push(b);
    };

    const startBlock = (kind: BlockKind, title?: string, icon?: string) => {
      pushBlock(current);
      current = { kind, title, icon, lines: [] };
    };

    for (const raw of lines) {
      const s = String(raw ?? '').trim();
      if (!s) continue;

      if (s === '—' || s === '---') {
        pushBlock(current);
        current = null;
        continue;
      }

      if (/^Factores que empujaron/i.test(s)) {
        startBlock('danger', 'Factores', 'alert-circle-outline');
        continue;
      }
      if (/^Recomendaciones/i.test(s)) {
        startBlock('info', 'Recomendaciones', 'bulb-outline');
        continue;
      }
      if (/^Valores usados/i.test(s)) {
        startBlock('plain', 'Valores usados', 'calculator-outline');
        continue;
      }

      if (!current) startBlock('plain');

      const isBullet = s.startsWith('•') || s.startsWith('-');
      const cleaned = isBullet ? s.replace(/^(\u2022|-)\s*/, '') : s;

      current.lines.push({ text: cleaned, isBullet });
    }

    pushBlock(current);
    return out;
  }
}
