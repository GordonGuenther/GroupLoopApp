import type { Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { sendCode, useSessions, verifyCode } from '@/auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { type Backend, DEFAULT_BACKEND_URL, saveBackends, useBackends } from '@/db/settings';
import { disconnect } from '@/db/sync';
import { useTheme } from '@/hooks/use-theme';

const isUrl = (value: string) => /^https?:\/\/\S+$/.test(value);
const isEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

export default function SettingsScreen() {
  const theme = useTheme();
  const settings = useBackends();
  const sessions = useSessions(settings?.backends);
  const [email, setEmail] = useState<string>();

  // Rows stay while sessions reload after a change, so a sent code is not lost.
  if (!settings) return <ThemedView style={styles.fill} />;
  const { backends, defaultId } = settings;
  // Prefilled with the account of a connected backend.
  const connectedEmail = Object.values(sessions ?? {}).find((session) => session)?.user.email;
  const currentEmail = email ?? connectedEmail ?? '';

  const save = (backend: Backend) =>
    saveBackends({
      backends: backends.map((other) => (other.id === backend.id ? backend : other)),
      defaultId,
    });
  const add = () =>
    saveBackends({
      backends: [...backends, { id: Crypto.randomUUID(), name: '', backendUrl: '', apiKey: '' }],
      defaultId,
    });
  const remove = (id: string) =>
    saveBackends({ backends: backends.filter((backend) => backend.id !== id), defaultId });

  return (
    <ScrollView style={{ backgroundColor: theme.background }}>
      <ThemedView style={styles.container}>
        <ThemedText type="smallBold">Email</ThemedText>
        <TextInput
          {...inputProps(theme)}
          value={currentEmail}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoComplete="email"
        />

        <ThemedText type="smallBold" style={styles.heading}>
          Backends
        </ThemedText>
        {backends.map((backend) => (
          <BackendRow
            key={backend.id}
            backend={backend}
            session={sessions?.[backend.id] ?? null}
            email={currentEmail}
            isDefault={backend.id === defaultId}
            onSave={save}
            onMakeDefault={() => saveBackends({ backends, defaultId: backend.id })}
            onRemove={() => remove(backend.id)}
          />
        ))}
        <View style={styles.buttons}>
          <Button label="Add backend" onPress={add} />
        </View>
      </ThemedView>
    </ScrollView>
  );
}

type BackendRowProps = {
  backend: Backend;
  session: Session | null;
  email: string;
  isDefault: boolean;
  onSave: (backend: Backend) => Promise<void>;
  onMakeDefault: () => void;
  onRemove: () => void;
};

/** A backend with its sign-in. Only editable while signed out. */
function BackendRow({
  backend: saved,
  session,
  email,
  isDefault,
  onSave,
  onMakeDefault,
  onRemove,
}: BackendRowProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState<Partial<Backend>>({});
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const connected = !!session;
  const backend = { ...saved, ...draft };
  const canConnect =
    !busy &&
    isEmail(email) &&
    backend.name.trim() !== '' &&
    isUrl(backend.backendUrl) &&
    !!backend.apiKey;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const trimmed = { ...backend, name: backend.name.trim() };
      await onSave(trimmed);
      setDraft({});
      await sendCode(trimmed, email);
      setCodeSent(true);
    });

  const verify = () =>
    run(async () => {
      await verifyCode(backend, email, code);
      setCode('');
      setCodeSent(false);
    });

  const props: TextInputProps = { ...inputProps(theme), editable: !connected && !codeSent };

  return (
    <ThemedView style={[styles.backend, { borderColor: theme.backgroundElement }]}>
      <View style={styles.titleRow}>
        <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
          {saved.name || 'New backend'}
        </ThemedText>
        {isDefault ? (
          <ThemedText type="small" themeColor="textSecondary">
            Default
          </ThemedText>
        ) : (
          <Button label="Make default" onPress={onMakeDefault} />
        )}
      </View>
      {connected && (
        <ThemedText type="small" themeColor="textSecondary">
          Connected as {session.user.email}
        </ThemedText>
      )}

      <ThemedText type="small">Name</ThemedText>
      <TextInput
        {...props}
        value={backend.name}
        onChangeText={(name) => setDraft({ ...draft, name })}
        placeholder="e.g. Family server"
        autoCapitalize="sentences"
      />

      <ThemedText type="small">Backend URL</ThemedText>
      <TextInput
        {...props}
        value={backend.backendUrl}
        onChangeText={(backendUrl) => setDraft({ ...draft, backendUrl })}
        placeholder={DEFAULT_BACKEND_URL}
        keyboardType="url"
      />
      {draft.backendUrl !== undefined && !isUrl(draft.backendUrl) && (
        <ThemedText type="small" themeColor="textSecondary">
          Enter a URL starting with http:// or https://
        </ThemedText>
      )}

      <ThemedText type="small">API key</ThemedText>
      <TextInput
        {...props}
        value={backend.apiKey}
        onChangeText={(apiKey) => setDraft({ ...draft, apiKey })}
        placeholder="The backend's anon key"
      />

      {codeSent && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            We sent a code to {email}.
          </ThemedText>
          <TextInput
            {...props}
            editable
            value={code}
            onChangeText={setCode}
            placeholder="Code"
            keyboardType="number-pad"
            autoComplete="one-time-code"
          />
        </>
      )}

      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}

      <View style={styles.buttons}>
        {connected ? (
          <Button label="Disconnect" onPress={() => run(() => disconnect(backend))} />
        ) : codeSent ? (
          <>
            <Button label="Verify" primary disabled={busy || !code} onPress={verify} />
            <Button label="Cancel" onPress={() => setCodeSent(false)} />
          </>
        ) : (
          <>
            <Button label="Connect" primary disabled={!canConnect} onPress={connect} />
            {/* Entries without groups need a default backend. */}
            {!isDefault && <Button label="Remove" onPress={onRemove} />}
          </>
        )}
      </View>
    </ThemedView>
  );
}

const inputProps = (theme: ReturnType<typeof useTheme>): TextInputProps => ({
  placeholderTextColor: theme.textSecondary,
  autoCapitalize: 'none',
  autoCorrect: false,
  style: [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }],
});

function Button({
  label,
  primary,
  disabled,
  onPress,
}: {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress}>
      <ThemedView
        type={primary ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.button, disabled && styles.disabled]}>
        <ThemedText type={primary ? 'smallBold' : 'small'}>{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  heading: {
    marginTop: Spacing.three,
  },
  backend: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  title: {
    flexShrink: 1,
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  disabled: {
    opacity: 0.4,
  },
});
