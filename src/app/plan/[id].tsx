import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  HeaderButton,
  IconButton,
  Row,
  StackScroll,
  Txt,
  confirm,
} from '@/components/ui';
import { clock } from '@/lib/format';
import { space, useColors } from '@/lib/theme';
import type { Plan, PlanDay } from '@/lib/types';
import { nextPlanDay, useExerciseLookup, useStore } from '@/store/store';

const REST_OPTIONS = [45, 60, 90, 120, 150, 180];

export default function PlanDetail() {
  const c = useColors();
  const params = useLocalSearchParams<{ id: string; edit?: string }>();
  const [editing, setEditing] = useState(params.edit === '1');
  const plan = useStore((s) => s.plans.find((p) => p.id === params.id));
  const workouts = useStore((s) => s.workouts);
  const activePlanId = useStore((s) => s.activePlanId);
  const activeWorkout = useStore((s) => s.activeWorkout);
  const setActivePlan = useStore((s) => s.setActivePlan);
  const updatePlan = useStore((s) => s.updatePlan);
  const deletePlan = useStore((s) => s.deletePlan);
  const addPlanDay = useStore((s) => s.addPlanDay);
  const startWorkout = useStore((s) => s.startWorkout);

  if (!plan) {
    return (
      <StackScroll>
        <EmptyState icon="plans" title="Schema niet gevonden" text="Misschien is het verwijderd." />
      </StackScroll>
    );
  }

  const isActive = plan.id === activePlanId;
  const next = nextPlanDay(plan, workouts);

  const start = async (day: PlanDay) => {
    if (
      activeWorkout &&
      !(await confirm('Er loopt al een training', 'Wil je die vervangen?', 'Vervang', true))
    )
      return;
    startWorkout({ planId: plan.id, dayId: day.id });
    router.push('/workout');
  };

  const remove = async () => {
    if (
      await confirm(
        'Schema verwijderen?',
        `"${plan.name}" wordt verwijderd. Je trainingsgeschiedenis blijft bewaard.`,
        'Verwijder',
        true,
      )
    ) {
      router.back();
      deletePlan(plan.id);
    }
  };

  return (
    <StackScroll>
      <Stack.Screen
        options={{
          title: editing ? 'Schema bewerken' : plan.name,
          headerRight: () => (
            <HeaderButton
              label={editing ? 'Klaar' : 'Bewerk'}
              strong
              onPress={() => setEditing(!editing)}
            />
          ),
        }}
      />

      {editing ? (
        <Card>
          <Field
            label="Naam"
            value={plan.name}
            onChangeText={(name) => updatePlan(plan.id, { name })}
          />
          <Field
            label="Omschrijving"
            value={plan.description}
            placeholder="Bijv. 3× per week, focus op kracht"
            onChangeText={(description) => updatePlan(plan.id, { description })}
          />
        </Card>
      ) : (
        <View style={{ gap: space.md }}>
          {plan.description ? <Txt variant="dim">{plan.description}</Txt> : null}
          {isActive ? (
            <Row gap={6}>
              <Icon name="check" size={16} color={c.success} />
              <Txt variant="h3" color={c.success}>
                Actief schema
              </Txt>
            </Row>
          ) : (
            <Button
              label="Maak actief"
              icon="star"
              variant="secondary"
              onPress={() => setActivePlan(plan.id)}
            />
          )}
        </View>
      )}

      {plan.days.map((day) =>
        editing ? (
          <EditDay key={day.id} plan={plan} day={day} />
        ) : (
          <ViewDay
            key={day.id}
            day={day}
            isNext={isActive && day.id === next?.id}
            onStart={() => start(day)}
          />
        ),
      )}

      {editing ? (
        <>
          <Button
            label="Dag toevoegen"
            icon="plus"
            variant="secondary"
            onPress={() => addPlanDay(plan.id, `Dag ${plan.days.length + 1}`)}
          />
          <Button label="Schema verwijderen" icon="trash" variant="danger" onPress={remove} />
        </>
      ) : plan.days.every((d) => d.exercises.length === 0) ? (
        <Button label="Oefeningen toevoegen" icon="edit" onPress={() => setEditing(true)} />
      ) : null}
    </StackScroll>
  );
}

function ViewDay({ day, isNext, onStart }: { day: PlanDay; isNext: boolean; onStart: () => void }) {
  const c = useColors();
  const getExercise = useExerciseLookup();
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="h2">{day.name}</Txt>
        {isNext ? (
          <Txt variant="small" color={c.accent} style={{ fontWeight: '700' }}>
            VOLGENDE
          </Txt>
        ) : null}
      </Row>
      {day.exercises.length === 0 ? (
        <Txt variant="dim">Nog geen oefeningen. Tik op Bewerk om ze toe te voegen.</Txt>
      ) : (
        <View style={{ gap: space.sm }}>
          {day.exercises.map((pe, i) => (
            <View key={pe.id} style={{ gap: space.sm }}>
              {i > 0 ? <Divider /> : null}
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt style={{ flex: 1 }} numberOfLines={1}>
                  {getExercise(pe.exerciseId)?.name ?? 'Onbekende oefening'}
                </Txt>
                <Txt variant="num">
                  {pe.sets} × {pe.target}
                </Txt>
              </Row>
            </View>
          ))}
        </View>
      )}
      {day.exercises.length > 0 ? (
        <Button
          label={`Start ${day.name}`}
          icon="play"
          variant={isNext ? 'primary' : 'secondary'}
          onPress={onStart}
        />
      ) : null}
    </Card>
  );
}

function EditDay({ plan, day }: { plan: Plan; day: PlanDay }) {
  const c = useColors();
  const getExercise = useExerciseLookup();
  const renamePlanDay = useStore((s) => s.renamePlanDay);
  const removePlanDay = useStore((s) => s.removePlanDay);
  const updatePlanExercise = useStore((s) => s.updatePlanExercise);
  const removePlanExercise = useStore((s) => s.removePlanExercise);
  const movePlanExercise = useStore((s) => s.movePlanExercise);

  const removeDay = async () => {
    if (await confirm('Dag verwijderen?', day.name, 'Verwijder', true))
      removePlanDay(plan.id, day.id);
  };

  return (
    <Card>
      <Row>
        <Field
          value={day.name}
          onChangeText={(name) => renamePlanDay(plan.id, day.id, name)}
          accessibilityLabel="Naam van de dag"
          style={{ fontWeight: '700', fontSize: 18 }}
        />
        <IconButton
          icon="trash"
          label={`${day.name} verwijderen`}
          color={c.danger}
          onPress={removeDay}
        />
      </Row>

      {day.exercises.map((pe, i) => {
        const ex = getExercise(pe.exerciseId);
        return (
          <View key={pe.id} style={{ gap: space.sm, paddingTop: space.sm }}>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
                {ex?.name ?? 'Onbekende oefening'}
              </Txt>
              <Row gap={6}>
                <IconButton
                  icon="chevronUp"
                  size={30}
                  label="Omhoog"
                  onPress={() => movePlanExercise(plan.id, day.id, pe.id, -1)}
                />
                <IconButton
                  icon="chevronDown"
                  size={30}
                  label="Omlaag"
                  onPress={() => movePlanExercise(plan.id, day.id, pe.id, 1)}
                />
                <IconButton
                  icon="close"
                  size={30}
                  label="Verwijderen"
                  color={c.danger}
                  onPress={() => removePlanExercise(plan.id, day.id, pe.id)}
                />
              </Row>
            </Row>
            <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
              <View style={{ gap: space.xs }}>
                <Txt variant="small">Sets</Txt>
                <Row gap={6}>
                  <IconButton
                    icon="minus"
                    size={36}
                    label="Minder sets"
                    onPress={() =>
                      updatePlanExercise(plan.id, day.id, pe.id, { sets: Math.max(1, pe.sets - 1) })
                    }
                  />
                  <Txt variant="num" style={{ minWidth: 22, textAlign: 'center', fontSize: 17 }}>
                    {pe.sets}
                  </Txt>
                  <IconButton
                    icon="plus"
                    size={36}
                    label="Meer sets"
                    onPress={() =>
                      updatePlanExercise(plan.id, day.id, pe.id, {
                        sets: Math.min(10, pe.sets + 1),
                      })
                    }
                  />
                </Row>
              </View>
              <Field
                label={ex?.kind === 'time' ? 'Doel (sec)' : ex?.kind === 'cardio' ? 'Doel' : 'Reps'}
                value={pe.target}
                onChangeText={(target) => updatePlanExercise(plan.id, day.id, pe.id, { target })}
                style={{ height: 36 }}
              />
            </Row>
            {ex?.kind !== 'cardio' ? (
              <View style={{ gap: space.xs }}>
                <Txt variant="small">Rusttijd</Txt>
                <Row gap={6}>
                  {REST_OPTIONS.map((sec) => {
                    const on = pe.restSec === sec;
                    return (
                      <Pressable
                        key={sec}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => updatePlanExercise(plan.id, day.id, pe.id, { restSec: sec })}
                        style={{
                          flex: 1,
                          height: 32,
                          borderRadius: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: on ? c.text : c.cardAlt,
                        }}>
                        <Txt
                          variant="small"
                          color={on ? c.bg : c.text}
                          style={{ fontWeight: '600' }}>
                          {clock(sec)}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </Row>
              </View>
            ) : null}
          </View>
        );
      })}

      <Button
        label="Oefening toevoegen"
        icon="plus"
        variant="ghost"
        onPress={() =>
          router.push({
            pathname: '/exercises',
            params: { mode: 'plan', planId: plan.id, dayId: day.id },
          })
        }
      />
    </Card>
  );
}
