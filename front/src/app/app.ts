import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService, User } from './api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly apiService = inject(ApiService);

  // getHello
  protected readonly helloResponse = signal<string | null>(null);
  protected readonly helloLoading = signal(false);
  protected readonly helloError = signal<string | null>(null);

  // users list
  protected readonly users = signal<User[]>([]);

  // create form
  protected readonly createName = signal('');
  protected readonly createEmail = signal('');
  protected readonly createLoading = signal(false);
  protected readonly createError = signal<string | null>(null);

  // delete form
  protected readonly deleteId = signal<number | null>(null);
  protected readonly deleteLoading = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.apiService.getUsers().subscribe({
      next: (list) => this.users.set(list),
      error: () => {},
    });
  }

  testApi(): void {
    this.helloLoading.set(true);
    this.helloResponse.set(null);
    this.helloError.set(null);
    this.apiService.getHello().subscribe({
      next: (msg) => { this.helloResponse.set(msg); this.helloLoading.set(false); },
      error: (err) => { this.helloError.set('Erreur : ' + (err.message ?? 'inconnue')); this.helloLoading.set(false); },
    });
  }

  createUser(): void {
    this.createLoading.set(true);
    this.createError.set(null);
    this.apiService.createUser({ name: this.createName(), email: this.createEmail() }).subscribe({
      next: () => {
        this.createName.set('');
        this.createEmail.set('');
        this.createLoading.set(false);
        this.loadUsers();
      },
      error: (err) => {
        this.createError.set(err.error?.message ?? 'Erreur lors de la création');
        this.createLoading.set(false);
      },
    });
  }

  deleteUser(): void {
    const id = this.deleteId();
    if (!id) return;
    this.deleteLoading.set(true);
    this.deleteError.set(null);
    this.apiService.deleteUser(id).subscribe({
      next: () => {
        this.deleteId.set(null);
        this.deleteLoading.set(false);
        this.loadUsers();
      },
      error: (err) => {
        this.deleteError.set(err.error?.message ?? 'Utilisateur introuvable');
        this.deleteLoading.set(false);
      },
    });
  }
}
